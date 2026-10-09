# Benchmark summary: measuring-hate-speech

- **dataset**: "measuring-hate-speech"
- **policies**: ["dummy-regex"]
- **dataFile**: "data.jsonl"
- **sample**: 50
- **seed**: 0
- **modelName**: "gemini-2.5-flash-lite"
- **baseUrl**: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
- **delayMs**: 4000
- **concurrency**: 4
- **retries**: 3
- **cache**: true
- **earlyExit**: false
- **items**: 50
- **startedAt**: "2026-10-09T08:51:26.811Z"
- **finishedAt**: "2026-10-09T08:51:26.821Z"

## Overall

| policy | n | errors | base rate | accuracy | precision | recall | F1 | pred+ rate | LLM-call rate | fetches | cache hits | ms/request | p95 ms/request |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dummy-regex | 50 | 0 | 0.260 | 0.720 | 0.429 | 0.231 | 0.300 | 0.140 | 0.000 | 0 | 0 | – | – |

## By category

### gender

| policy | n | errors | base rate | accuracy | precision | recall | F1 | pred+ rate |
|---|---|---|---|---|---|---|---|---|
| dummy-regex | 20 | 0 | 0.300 | 0.750 | 0.667 | 0.333 | 0.444 | 0.150 |

### race

| policy | n | errors | base rate | accuracy | precision | recall | F1 | pred+ rate |
|---|---|---|---|---|---|---|---|---|
| dummy-regex | 18 | 0 | 0.222 | 0.778 | 0.500 | 0.250 | 0.333 | 0.111 |

### religion

| policy | n | errors | base rate | accuracy | precision | recall | F1 | pred+ rate |
|---|---|---|---|---|---|---|---|---|
| dummy-regex | 12 | 0 | 0.083 | 0.917 | 0.500 | 1.000 | 0.667 | 0.167 |

### origin

| policy | n | errors | base rate | accuracy | precision | recall | F1 | pred+ rate |
|---|---|---|---|---|---|---|---|---|
| dummy-regex | 10 | 0 | 0.200 | 0.600 | 0.250 | 0.500 | 0.333 | 0.400 |

### sexuality

| policy | n | errors | base rate | accuracy | precision | recall | F1 | pred+ rate |
|---|---|---|---|---|---|---|---|---|
| dummy-regex | 7 | 0 | 0.571 | 0.429 | – | 0.000 | – | 0.000 |

### politics

| policy | n | errors | base rate | accuracy | precision | recall | F1 | pred+ rate |
|---|---|---|---|---|---|---|---|---|
| dummy-regex | 5 | 0 | 0.000 | 0.800 | 0.000 | – | – | 0.200 |

### disability

| policy | n | errors | base rate | accuracy | precision | recall | F1 | pred+ rate |
|---|---|---|---|---|---|---|---|---|
| dummy-regex | 4 | 0 | 0.000 | 1.000 | – | – | – | 0.000 |

### age

| policy | n | errors | base rate | accuracy | precision | recall | F1 | pred+ rate |
|---|---|---|---|---|---|---|---|---|
| dummy-regex | 1 | 0 | 0.000 | 1.000 | – | – | – | 0.000 |
