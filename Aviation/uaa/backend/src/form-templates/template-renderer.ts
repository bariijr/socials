export interface RenderableTemplate {
  bodyTemplate: string;
  mergeFields: string[];
}

export function renderTemplate(template: RenderableTemplate, values: Record<string, string>): string {
  // Replace highest-numbered placeholders first so "#1" doesn't clobber part of "#10".
  return template.mergeFields
    .map((field, index) => ({ index: index + 1, value: values[field] }))
    .sort((a, b) => b.index - a.index)
    .reduce((body, { index, value }) => {
      if (value == null) return body;
      return body.split(`#${index}`).join(value);
    }, template.bodyTemplate);
}
