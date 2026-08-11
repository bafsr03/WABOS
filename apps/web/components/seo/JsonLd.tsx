/**
 * Renders a JSON-LD block. The `<` escape prevents a stray "</script>" inside
 * any string field from breaking out of the tag.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
