import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../engine.js';
import { EvaluationResult } from '../types.js';
import policiesJson from "./policies/feature_policies.json" with { type: "json" };

const policies: any = policiesJson;

/**
 * Runs a small example of all_of combinator that requires
 * all of 'x' and 'y' in the test on input (regex)
 */
async function allOf(text: string): Promise<boolean> {
  console.error(policies.all_of_p)

  const e = new PolicyEngine({policyJson: policies.all_of_p})
  const res: EvaluationResult = await e.evaluate({text})
  return !res.violation
}


describe('all_of', async () => {
  it('passes when both letters present', async () => {
    const result = await allOf('xy');
    expect(result).toBe(true);
  });

  it('fails when x missing', async () => {
    const result = await allOf('y');
    expect(result).toBe(true);
  });

  it('fails when y missing', async () => {
    const result = await allOf('x');
    expect(result).toBe(true);
  });

  it('fails on empty', async () => {
    const result = await allOf('');
    expect(result).toBe(true);
  });
});
