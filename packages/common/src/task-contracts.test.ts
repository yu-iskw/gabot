import { describe, expect, it } from 'vitest';

import {
  buildDiagnosisArtifactContent,
  DEFAULT_DIAGNOSIS_CRITERIA,
  diagnosisArtifactMeetsCriteria,
  digestTaskAdmitRequest,
  parseTaskAdmitRequest,
} from './task-contracts.js';

describe('task contracts', () => {
  it('parses admit requests with diagnosis defaults', () => {
    const parsed = parseTaskAdmitRequest({
      objective: 'Investigate CI failure',
      channelId: 'ch-1',
      idempotencyKey: 'key-1',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.successCriteria).toBe(DEFAULT_DIAGNOSIS_CRITERIA);
    expect(parsed.value.audience).toBe('creator');
    expect(parsed.value.resources).toEqual([]);
  });

  it('rejects empty objective', () => {
    const parsed = parseTaskAdmitRequest({
      objective: '  ',
      channelId: 'ch-1',
      idempotencyKey: 'key-1',
    });
    expect(parsed.ok).toBe(false);
  });

  it('builds a stable digest', () => {
    const base = {
      objective: 'Investigate CI failure',
      channelId: 'ch-1',
      idempotencyKey: 'key-1',
      successCriteria: DEFAULT_DIAGNOSIS_CRITERIA,
      audience: 'creator',
      resources: ['b', 'a'],
    };
    const first = digestTaskAdmitRequest(base);
    const second = digestTaskAdmitRequest({ ...base, resources: ['a', 'b'] });
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('accepts diagnosis artifacts that meet criteria', () => {
    const content = buildDiagnosisArtifactContent('Investigate CI', 'flake on lint');
    expect(diagnosisArtifactMeetsCriteria(DEFAULT_DIAGNOSIS_CRITERIA, content)).toBe(true);
    expect(diagnosisArtifactMeetsCriteria(DEFAULT_DIAGNOSIS_CRITERIA, 'no sections')).toBe(false);
  });
});
