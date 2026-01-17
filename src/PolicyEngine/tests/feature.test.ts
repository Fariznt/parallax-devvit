/**
 * Feature tests
 * Uses match node whitelisting as a default for combinator tests
 */

import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../engine.js';
import { EvaluationResult } from '../types.js';
import policiesJson from "./policies/feature_policies.json" with { type: "json" };

const policies: any = policiesJson;

/**
 * Runs policy engine for given text and policy, returning true
 * upon violation.
 */
async function policyViolates(policyJson: any, text: string): Promise<boolean> {
  const e = new PolicyEngine({ policyJson: policyJson });
  const res: EvaluationResult = await e.evaluate({ text });
  return res.violation;
}

/**
 * Runs a small example of 'not' combinator on
 * a node requiring match with 'a' (regex whitelist)
 */
async function not(text: string): Promise<boolean> {
  console.log(policies.not_p)
  return policyViolates(policies.not_p, text)
}

describe(`not 'a'`, async () => {
  it(`passes when 'a' not present`, async () => {
    const result = await not('xyz');
    expect(result).toBe(false);
  });

  it('violates when a present', async () => {
    const result = await not('xyza');
    expect(result).toBe(true);
  });
});

/**
 * Runs a small example of all_of combinator that requires
 * 'a' and 'b' match in the input text (regex whitelist). 
 * Returns true upon violation
 */
async function allOf(text: string): Promise<boolean> {
  return policyViolates(policies.all_of_p, text)
}

describe('all_of [a,b]', async () => {
  it('passes when both letters present', async () => {
    const result = await allOf('ab');
    expect(result).toBe(false);
  });

  it('violates when one b not present', async () => {
    const result = await allOf('xyza');
    expect(result).toBe(true);
  });

  it('violates when one a not present', async () => {
    const result = await allOf('bxyz');
    expect(result).toBe(true);
  });

  it('violates when neither present', async () => {
    const result = await allOf('xyz');
    expect(result).toBe(true);
  });
});

/**
 * Runs a small example of all_of wrapped in not:
 * negates the requirement that BOTH 'a' and 'b' match
 * i.e. one or more of 'a' 'b' must fail to match
 * Returns true upon violation.
 */
async function notAllOf(text: string): Promise<boolean> {
  return policyViolates(policies.not_all_of_p, text)
}

describe('not(all_of) [a,b]', async () => {
  it('violates when both letters present (since NOT(all_of) fails)', async () => {
    const result = await notAllOf('ab');
    expect(result).toBe(true);
  });

  it('passes when one b not present', async () => {
    const result = await notAllOf('xyza');
    expect(result).toBe(false);
  });

  it('passes when one a not present', async () => {
    const result = await notAllOf('bxyz');
    expect(result).toBe(false);
  });

  it('passes when neither present', async () => {
    const result = await notAllOf('xyz');
    expect(result).toBe(false);
  });
});

/**
 * Runs a small example of any_of combinator that requires
 * any of 'a' and 'b' to be in input text (regex whitelist).
 * Returns true upon violation
 */
async function anyOf(text: string): Promise<boolean> {
  return policyViolates(policies.any_of_p, text)
}

describe('any_of [a,b]', async () => {
  it('passes when both are present', async () => {
    const result = await anyOf('ab')
    expect(result).toBe(false)
  })

  it('passes when b present', async () => {
    const result = await anyOf('bxyz')
    expect(result).toBe(false)
  })

  it('passes when a present', async () => {
    const result = await anyOf('xyza')
    expect(result).toBe(false)
  })
  it('violates when neither present', async () => {
    const result = await anyOf('xyz')
    expect(result).toBe(true)
  })
})

/**
 * Runs a small example of any_of wrapped in not:
 * negates the requirement that any of 'a' and 'b' match
 * i.e. none of 'a' 'b' may match.
 * Returns true upon violation.
 */
async function notAnyOf(text: string): Promise<boolean> {
  return policyViolates(policies.not_any_of_p, text)
}

describe('not(any_of) [a,b]', async () => {
  it('violates when both are present (since NOT(any_of) fails)', async () => {
    const result = await notAnyOf('ab')
    expect(result).toBe(true)
  })

  it('violates when b present', async () => {
    const result = await notAnyOf('bxyz')
    expect(result).toBe(true)
  })

  it('violates when a present', async () => {
    const result = await notAnyOf('xyza')
    expect(result).toBe(true)
  })

  it('passes when neither present', async () => {
    const result = await notAnyOf('xyz')
    expect(result).toBe(false)
  })
})

/**
 * Runs a small example of regex whitelisting.
 * Returns true upon violation.
 */
async function regex_wl(text: string): Promise<boolean> {
  return policyViolates(policies.regex_whitelist, text)
}

/**
 * Runs a small example of regex blacklisting.
 * Returns true upon violation.
 */
async function regex_bl(text: string): Promise<boolean> {
  return policyViolates(policies.regex_blacklist, text)
}

/**
 * Runs a small example of regex sequential whitelisting.
 * Returns true upon violation.
 */
async function regex_wl_g(text: string): Promise<boolean> {
  return policyViolates(policies.regex_whitelist_g, text)
}

/**
 * Runs a small example of regex sequential blacklisting.
 * Returns true upon violation.
 */
async function regex_bl_g(text: string): Promise<boolean> {
  return policyViolates(policies.regex_blacklist_g, text)
}

describe('regex_check features'), () => {
  describe('whitelist (non-g): patterns ["a","b"] require at least one match', () => {
    it('passes when "a" present', async () => {
      const result = await regex_wl('xa');
      expect(result).toBe(false);
    });

    it('passes when "b" present', async () => {
      const result = await regex_wl('yb');
      expect(result).toBe(false);
    });

    it('passes when both present', async () => {
      const result = await regex_wl('ab');
      expect(result).toBe(false);
    });

    it('violates when neither present', async () => {
      const result = await regex_wl('xyz');
      expect(result).toBe(true);
    });
  });

  describe('blacklist (non-g): patterns ["a","b"] violate if any match', () => {
    it('violates when "a" present', async () => {
      const result = await regex_bl('xa');
      expect(result).toBe(true);
    });

    it('violates when "b" present', async () => {
      const result = await regex_bl('yb');
      expect(result).toBe(true);
    });

    it('violates when both present', async () => {
      const result = await regex_bl('ab');
      expect(result).toBe(true);
    });

    it('passes when neither present', async () => {
      const result = await regex_bl('xyz');
      expect(result).toBe(false);
    });
  });

  describe('whitelist (g): patterns ["a","b"] require sequential match a then b', () => {
    it('violates when only "a" present', async () => {
      const result = await regex_wl_g('a---');
      expect(result).toBe(true);
    });

    it('violates when only "b" present', async () => {
      const result = await regex_wl_g('---b');
      expect(result).toBe(true);
    });

    it('passes when "a" then later "b" present', async () => {
      const result = await regex_wl_g('a---b');
      expect(result).toBe(false);
    });

    it('violates when order is reversed ("b" then "a")', async () => {
      const result = await regex_wl_g('b---a');
      expect(result).toBe(true);
    });
  });

  describe('blacklist (g): patterns ["a","b"] violate only if sequential match a then b', () => {
    it('passes when only "a" present', async () => {
      const result = await regex_bl_g('a---');
      expect(result).toBe(false);
    });

    it('passes when only "b" present', async () => {
      const result = await regex_bl_g('---b');
      expect(result).toBe(false);
    });

    it('violates when "a" then later "b" present', async () => {
      const result = await regex_bl_g('a---b');
      expect(result).toBe(true);
    });

    it('passes when order is reversed ("b" then "a")', async () => {
      const result = await regex_bl_g('b---a');
      expect(result).toBe(false);
    });
  });
}