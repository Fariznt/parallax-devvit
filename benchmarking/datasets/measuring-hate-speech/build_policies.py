"""
Builds this dataset's policies/regex.json, llm.json and parallax.json from one source of truth,
so the parallax gate stays identical to the regex policy and its semantic node identical to the
llm policy (identical LLM requests -> parallax reuses llm's cached responses).

  regex.json     all_of (flat OR: any matching word flags) over
                   - davidson_2017_lexicon   the standard list, unmodified
                   - hate_like_words         all_of of category-agnostic hostile vocabulary
                   - sensitive_topics        all_of of per-category slurs/stereotypes/dog whistles
  llm.json       the single semantic_check
  parallax.json  one match_check with every regex.json pattern (same flat-OR logic; the engine
                 only follows next_check on predicates), whose next_check is llm.json

Standard list: Davidson, Warmsley, Macy & Weber (2017), "Automated Hate Speech Detection and the
Problem of Offensive Language", ICWSM. Hatebase-derived n-gram lexicon, MIT License, Copyright (c)
2017 Tom Davidson. https://github.com/t-davidson/hate-speech-and-offensive-language

Word lists below are plain words/phrases. Each becomes one case-insensitive pattern with word
boundaries; single words also match a plural "s"/"es" suffix. Every word appears in exactly one
node. Lists were written up front; later additions came from error analysis on a dev pool only
(positions 10000+ of the seed-0 shuffle), so benchmark with --seed 0 and --sample <= 10000.

Run: python3 benchmarking/datasets/measuring-hate-speech/build_policies.py
"""

import csv
import io
import json
import re
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
POLICIES_DIR = HERE / "policies"
LEXICON_URL = (
    "https://raw.githubusercontent.com/t-davidson/hate-speech-and-offensive-language"
    "/master/lexicons/refined_ngram_dict.csv"
)
LEXICON_PATH = HERE / "data" / "raw" / "davidson_refined_ngram_dict.csv"

CONDITION = (
    "is hate speech: it attacks, insults, demeans, dehumanizes (e.g. as animals, vermin, disease), "
    "or threatens or calls for violence, exclusion, or removal of a person or group because of an "
    "identity (race, ethnicity, national origin, immigration status, religion, gender, gender identity, "
    "sexual orientation, age, disability, political affiliation), via slurs, hostile stereotypes stated "
    "as fact, or mockery. Judge intent and target, not keywords: counter-speech, quoting or reporting hate "
    "to criticize it, reclaimed or in-group slang used without hostility, criticism of ideas, institutions, "
    "or an individual's actions not tied to their identity, and identity-neutral profanity are NOT hate speech."
)

# === Category-agnostic hostile vocabulary ===

HATE_LIKE_WORDS = {
    "dehumanizing": [
        "subhuman", "sub-human", "untermensch", "vermin", "cockroach", "parasite", "leech",
        "infestation", "infested", "savage", "animals", "beast", "mongrel", "inbred", "degenerate",
        "mutant", "primate", "ape", "monkey", "pig", "swine", "rat", "filth", "filthy", "scum",
        "trash", "garbage", "plague", "diseased", "less than human", "not even human", "breed like",
        "primitive",
    ],
    "violence": [
        "kill", "killed", "killing", "murder", "exterminate", "extermination", "eradicate",
        "genocide", "lynch", "lynching", "hang them", "gas them", "gassed", "shoot them",
        "slaughter", "massacre", "rape", "raped", "raping", "rapist", "die", "wipe them out",
        "wiped out", "kill yourself", "kys", "final solution", "ethnic cleansing", "race war",
        "concentration camp", "round them up", "sterilize", "castrate", "burn", "bomb", "nuke",
        "choke", "abort", "in hell",
    ],
    "hostile_insults": [
        "disgusting", "dirty", "nasty", "stupid", "dumb", "idiot", "moron", "worthless", "useless",
        "pathetic", "inferior", "ugly", "evil", "vile", "hate", "piece of shit", "bastard", "iq",
    ],
}

# === Per-category sensitive topic words (slurs, stereotypes, dog whistles, loaded issues) ===
# Deliberately excludes plain group names (black, muslim, women, ...), which in this dataset
# mostly appear in non-hateful comments.

SENSITIVE_TOPICS = {
    "race_black": [
        "nigger", "nigga", "nigguh", "niglet", "negro", "coon", "jigaboo", "sambo", "darkie",
        "darky", "pickaninny", "spearchucker", "porch monkey", "tar baby", "moon cricket", "groid",
        "sheboon", "dindu", "welfare queen", "thug", "ghetto", "13%", "13 percent", "fatherless",
        "watermelon", "fried chicken", "slavery", "slave", "cotton picker", "back of the bus",
    ],
    "race_asian": [
        "chink", "chinky", "gook", "slant eye", "slant-eyed", "zipperhead", "jap", "ching chong",
        "chinaman", "yellow peril", "kung flu", "china virus", "wuhan virus", "bat soup",
        "dog eater", "bat eater", "coolie", "pajeet", "street shitter", "dothead", "curry muncher",
        "paki", "poo in loo", "model minority",
    ],
    "race_latinx": [
        "spic", "spick", "wetback", "beaner", "greaser", "border hopper", "border jumper",
        "taco eater", "cartel", "drug mule", "ms-13",
    ],
    "race_middle_eastern": [
        "towelhead", "raghead", "sand nigger", "sand monkey", "camel jockey", "diaper head",
        "hajji", "durka durka",
    ],
    "race_native_american": [
        "redskin", "injun", "squaw", "prairie nigger", "wagon burner", "firewater", "drunken indian",
    ],
    "race_white": [
        "cracker", "honky", "honkies", "white trash", "gringo", "peckerwood", "whitey", "wigger",
        "mayo monkey", "white devil", "white privilege", "colonizer", "redneck", "hillbilly",
        "trailer trash",
    ],
    "race_supremacy": [
        "race mixing", "race traitor", "half breed", "half-breed", "mulatto", "mud people",
        "mud race", "white power", "white pride", "white genocide", "white supremacy",
        "white supremacist", "1488", "14 words", "heil hitler", "sieg heil", "kkk", "ku klux",
        "race realism", "master race", "superior race", "aryan", "shitskin",
    ],
    "religion_muslim": [
        "muzzie", "mudslime", "moslem", "muzrat", "pisslam", "islamofascist", "islamofascism",
        "religion of peace", "pedo prophet", "goat fucker", "sharia", "jihad", "jihadi", "jihadist",
        "allahu akbar", "suicide bomber", "isis", "caliphate", "burqa", "burka", "honor killing",
        "child bride", "72 virgins", "terrorist", "terrorism", "radical islam", "islamization",
        "eurabia",
    ],
    "religion_jewish": [
        "kike", "yid", "hebe", "heeb", "jewed", "jew down", "christ killer", "oven dodger",
        "zionazi", "zog", "(((", "shekel", "khazar", "holohoax", "6 million", "six million",
        "gas chamber", "ovens", "holocaust", "globalist", "rothschild", "soros", "happy merchant",
        "goyim", "jewish question", "protocols of zion", "zionist", "zionism",
    ],
    "religion_christian": [
        "bible thumper", "jesus freak", "sky daddy", "god botherer", "fundie", "papist",
        "pedo priest", "kiddie fiddler", "christcuck", "crusader",
    ],
    "religion_other": [
        "infidel", "kuffar", "kafir", "heathen", "cow piss", "cow urine", "cow worshipper",
        "devil worshipper",
    ],
    "origin_immigration": [
        "illegals", "illegal alien", "illegal immigrant", "anchor baby", "anchor babies",
        "invasion", "invader", "invading", "build the wall", "border wall", "deport", "deported",
        "deportation", "chain migration", "great replacement", "go back to", "send them back",
        "back to your country", "third world", "shithole", "rapefugee", "fresh off the boat",
    ],
    "gender_women": [
        "bitch", "whore", "hoe", "thot", "slut", "skank", "cunt", "twat", "feminazi", "roastie",
        "femoid", "foid", "gold digger", "make me a sandwich", "back in the kitchen",
        "belong in the kitchen", "repeal the 19th", "hysterical", "attention whore",
    ],
    "gender_men": [
        "soy boy", "soyboy", "beta male", "incel", "cuck", "cuckold", "simp", "neckbeard",
        "men are trash", "kill all men", "toxic masculinity", "male tears", "manbaby", "manchild",
    ],
    "gender_transgender": [
        "tranny", "trannies", "shemale", "she-male", "he-she", "ladyboy", "troon", "41%",
        "41 percent", "mentally ill", "mental illness", "men in dresses", "man in a dress",
        "biological male", "biological men", "real women", "bathroom bill", "puberty blockers",
        "gender ideology", "transgenderism", "transtrender", "attack helicopter", "dilate",
    ],
    "sexuality_lgbtq": [
        "fag", "faggot", "faggy", "fagot", "dyke", "homo", "queer", "lesbo", "poof", "poofter",
        "sodomite", "sodomy", "butt pirate", "carpet muncher", "fudge packer", "pillow biter",
        "rug muncher", "gay agenda", "homosexual agenda", "god hates fags", "aids",
        "conversion therapy", "abomination", "pedophile", "pedophilia", "pedo", "groomer",
        "grooming",
    ],
    "age": [
        "ok boomer", "senile", "geezer", "old hag", "old fart", "crypt keeper", "die off",
        "dying off",
    ],
    "disability": [
        "retard", "retarded", "tard", "spaz", "spastic", "cripple", "crippled", "mong",
        "mongoloid", "autist", "autismo", "sperg", "window licker", "short bus", "special ed",
        "vegetable", "eugenics", "euthanize", "euthanasia", "midget", "deaf and dumb",
        "brain dead", "downie",
    ],
    "politics": [
        "libtard", "leftard", "conservatard", "trumptard", "rethuglican", "demonrat", "commie",
        "snowflake", "chud", "sheeple", "cuckservative", "trumpanzee", "traitor", "treason",
    ],
}


def to_pattern(word: str, plural: bool) -> str:
    """Escaped, case-insensitive-ready JS regex for a word/phrase with word boundaries."""
    body = re.escape(word).replace("\\ ", r"\s+")
    if plural and re.fullmatch(r"[a-z]+", word):
        body += "(?:s|es)?"
    start = r"\b" if re.match(r"\w", word) else ""
    end = r"\b" if re.search(r"\w$", word) else ""
    return f"{start}{body}{end}"


def match_node(name: str, words: list[str], plural: bool = True) -> dict:
    return {
        "name": name,
        "match_check": {"blacklist": True, "patterns": [to_pattern(w, plural) for w in words], "flags": "i"},
    }


def load_lexicon() -> list[str]:
    if not LEXICON_PATH.exists():
        LEXICON_PATH.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {LEXICON_URL}")
        urllib.request.urlretrieve(LEXICON_URL, LEXICON_PATH)
    raw = LEXICON_PATH.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
    return [row["ngram"] for row in csv.DictReader(io.StringIO(raw))]


def check_unique(groups: list[dict[str, list[str]]]) -> None:
    seen: dict[str, str] = {}
    for group in groups:
        for node, words in group.items():
            for w in words:
                if w in seen:
                    raise ValueError(f'"{w}" is in both {seen[w]} and {node}')
                seen[w] = node


def build() -> dict[str, dict]:
    check_unique([HATE_LIKE_WORDS, SENSITIVE_TOPICS])
    regex = {
        "name": "hate speech keywords",
        "all_of": [
            # the standard list is used as published: exact n-grams, no plural expansion
            match_node("davidson_2017_lexicon", load_lexicon(), plural=False),
            {"name": "hate_like_words", "all_of": [match_node(n, ws) for n, ws in HATE_LIKE_WORDS.items()]},
            {"name": "sensitive_topics", "all_of": [match_node(n, ws) for n, ws in SENSITIVE_TOPICS.items()]},
        ],
    }
    llm = {"not": {"name": "hate speech", "semantic_check": {"condition": CONDITION}}}

    patterns: list[str] = []
    def collect(node: dict) -> None:
        if "match_check" in node:
            patterns.extend(p for p in node["match_check"]["patterns"] if p not in patterns)
        for child in node.get("all_of", []):
            collect(child)
    collect(regex)
    parallax = {
        "name": "hate speech keyword gate",
        "match_check": {"blacklist": True, "patterns": patterns, "flags": "i"},
        "next_check": llm,
    }
    return {"regex": regex, "llm": llm, "parallax": parallax}


def main() -> None:
    for name, policy in build().items():
        path = POLICIES_DIR / f"{name}.json"
        path.write_text(json.dumps(policy, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
