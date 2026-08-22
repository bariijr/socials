import { renderTemplate } from '../src/form-templates/template-renderer';

describe('renderTemplate', () => {
  it('substitutes #1/#2-style positional placeholders in mergeFields order', () => {
    const template = {
      bodyTemplate: 'Requesting permit for #1, tail #2, arriving #3.',
      mergeFields: ['tripNo', 'tail', 'arrDate'],
    };

    const result = renderTemplate(template, { tripNo: '482421', tail: 'N148B', arrDate: '2026-09-16' });

    expect(result).toBe('Requesting permit for 482421, tail N148B, arriving 2026-09-16.');
  });

  it('leaves a placeholder untouched when its merge field has no value', () => {
    const template = { bodyTemplate: 'Captain: #1', mergeFields: ['captName'] };

    const result = renderTemplate(template, {});

    expect(result).toBe('Captain: #1');
  });

  it('does not partially match #1 inside #10 and beyond (double digits stay distinct)', () => {
    const template = {
      bodyTemplate: '#1 #2 #3 #4 #5 #6 #7 #8 #9 #10',
      mergeFields: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
    };

    const result = renderTemplate(
      template,
      Object.fromEntries(template.mergeFields.map((f, i) => [f, `V${i + 1}`])),
    );

    expect(result).toBe('V1 V2 V3 V4 V5 V6 V7 V8 V9 V10');
  });
});
