import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePack } from "../src/packs/model";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const valid = { title: " OAuth ", description: " Evidence ", category: "security", tags: ["PKCE", "PKCE"], is_public: false,
  entries: [{ source_id: id, note: " Primary standard " }] };
test("pack normalization retains private visibility, ordering and reasons", () => {
  const next = { source_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", note: "Vendor guidance" };
  const parsed = parsePack({ ...valid, entries: [...valid.entries, next] });
  assert.equal(parsed.title, "OAuth"); assert.equal(parsed.is_public, false);
  assert.deepEqual(parsed.tags, ["PKCE"]); assert.deepEqual(parsed.entries.map(e => e.source_id), [id, next.source_id]);
  assert.equal(parsed.entries[0].note, "Primary standard");
});
for (const [name, input] of Object.entries({
  null: null, array: [], missing: {}, blank: { ...valid, title: " " }, long: { ...valid, title: "x".repeat(121) },
  visibility: { ...valid, is_public: "false" }, tags: { ...valid, tags: [3] }, manyTags: { ...valid, tags: Array(11).fill("tag") },
  empty: { ...valid, entries: [] }, many: { ...valid, entries: Array(51).fill(valid.entries[0]) },
  duplicate: { ...valid, entries: [valid.entries[0], { ...valid.entries[0], source_id: id.toUpperCase() }] },
  source: { ...valid, entries: [{ source_id: "bad", note: "" }] }, note: { ...valid, entries: [{ source_id: id, note: {} }] },
  longNote: { ...valid, entries: [{ source_id: id, note: "x".repeat(1001) }] },
})) test(`reject invalid pack: ${name}`, () => assert.throws(() => parsePack(input)));
