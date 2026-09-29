import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterAtlas, communityAffinities } from "../src/data.ts";
const node = (id, counts) => ({
  id,
  label: `University ${id}`,
  address: id === 2 ? "Japan" : "USA",
  counts,
  geo: [0, 0],
  xy: [0, 0],
});
const data = {
  communities: [
    {
      counts: [
        [2000, 3],
        [2020, 2],
      ],
    },
    {
      counts: [
        [2000, 1],
        [2020, 4],
      ],
    },
  ],
  institutions: [
    node(0, [
      [2000, 0, 3],
      [2020, 1, 5],
    ]),
    node(1, [
      [2000, 0, 2],
      [2020, 1, 3],
    ]),
    node(2, [
      [2000, 1, 1],
      [2020, 0, 4],
    ]),
  ],
  collaborations: [
    {
      source: 0,
      target: 1,
      counts: [
        [2000, 0, 2],
        [2020, 1, 3],
      ],
    },
    {
      source: 1,
      target: 2,
      counts: [
        [2000, 1, 1],
        [2020, 0, 1],
      ],
    },
  ],
  citationLinks: [
    {
      source: 0,
      target: 1,
      counts: [
        [2000, 5],
        [2020, 8],
      ],
    },
  ],
  totalByYear: [
    [2000, 4],
    [2020, 6],
  ],
};
const defaults = {
  start: 2000,
  end: 2020,
  community: null,
  query: "",
  minPapers: 1,
  edgeLimit: 0,
  institution: null,
  neighborhood: false,
};
test("year AND community must match the same publication group", () => {
  const r = filterAtlas(data, { ...defaults, start: 2020, community: 0 });
  assert.deepEqual(
    r.nodes.map((n) => n.id),
    [2],
  );
  assert.deepEqual(r.edges, []);
  assert.equal(r.nodes[0].count, 4);
});
test("shared-paper threshold and cap use period counts and retain total eligible edges", () => {
  const r = filterAtlas(data, { ...defaults, edgeLimit: 1 });
  assert.equal(r.eligibleEdges, 2);
  assert.equal(r.edges.length, 1);
  assert.equal(r.edges[0].count, 5);
  assert.equal(
    filterAtlas(data, { ...defaults, start: 2020, minPapers: 4 }).edges.length,
    0,
  );
});
test("neighborhood and search do not leak edges with invisible endpoints", () => {
  const r = filterAtlas(data, {
    ...defaults,
    institution: 0,
    neighborhood: true,
  });
  assert.deepEqual(
    r.nodes.map((n) => n.id),
    [0, 1],
  );
  assert.equal(r.edges.length, 1);
  const s = filterAtlas(data, { ...defaults, query: "japan" });
  assert.deepEqual(
    s.nodes.map((n) => n.id),
    [2],
  );
  assert.equal(s.edges.length, 0);
});
test("citation counts and institution representation use the selected years", () => {
  const r = filterAtlas(data, { ...defaults, start: 2020 });
  assert.deepEqual(r.communityCounts, [2, 4]);
  assert.equal(r.papers, 6);
  assert.equal(r.citationLinks[0].count, 8);
  assert.deepEqual(r.nodes.find((n) => n.id === 0).shares, [0, 5, 0]);
});
for (const dataset of ["robotics", "humanoid"])
  test(`${dataset}: generated evidence is consistent and filters are measured`, () => {
    const atlas = JSON.parse(
      readFileSync(
        new URL(`../public/data/atlas_${dataset}.json`, import.meta.url),
      ),
    );
    assert.equal(
      atlas.institutions.length,
      atlas.provenance.sourceInstitutions,
    );
    const counts = atlas.institutions.map((n, id) => {
      assert.equal(n.id, id);
      assert.ok(n.geo.every(Number.isFinite));
      assert.ok(n.xy.every(Number.isFinite));
      return new Map(n.counts.map(([y, c, n]) => [`${y}:${c}`, n]));
    });
    for (const e of atlas.collaborations)
      for (const [y, c, n] of e.counts) {
        assert.ok(n > 0);
        assert.ok(n <= counts[e.source].get(`${y}:${c}`));
        assert.ok(n <= counts[e.target].get(`${y}:${c}`));
      }
    for (let ci = 0; ci < atlas.communities.length; ci++)
      assert.equal(
        atlas.communities[ci].counts.reduce((s, [, n]) => s + n, 0),
        atlas.communities[ci].size,
      );
    const times = [];
    for (let i = 0; i < 8; i++) {
      const r = filterAtlas(atlas, {
        ...defaults,
        start: 2000 + i,
        end: 2022,
        community: i % 2 ? i % 10 : null,
        edgeLimit: 1500,
      });
      times.push(r.ms);
      assert.ok(r.edges.length <= 1500);
    }
    times.sort((a, b) => a - b);
    console.log(
      `${dataset} filter median ${times[4].toFixed(1)} ms, max ${times.at(-1).toFixed(1)} ms`,
    );
  });

test("community relationship widths preserve the previous affinity and decrease with fewer citations", () => {
  const atlas = JSON.parse(
    readFileSync(
      new URL("../public/data/atlas_robotics.json", import.meta.url),
    ),
  );
  const full = atlas.citationLinks.map((e) => ({
    source: e.source,
    target: e.target,
    count: e.counts.reduce((sum, [, n]) => sum + n, 0),
  }));
  const actual = communityAffinities(atlas, full);
  for (const e of actual) {
    const prior = atlas.links.find(
      (l) =>
        (+l.source === e.source && +l.target === e.target) ||
        (+l.source === e.target && +l.target === e.source),
    );
    assert.ok(Math.abs(e.affinity - prior.normalized) < 1e-10);
  }
  const reduced = communityAffinities(
    atlas,
    full.map((e) => ({ ...e, count: Math.floor(e.count / 2) })),
  );
  for (let i = 0; i < actual.length; i++) {
    assert.ok(reduced[i].affinity <= actual[i].affinity);
    assert.ok(reduced[i].contrast <= actual[i].contrast);
  }
  assert.equal(Math.max(...actual.map((e) => e.contrast)), 1);
});

test("selected connections survive the overview cap and remain ranked within temporal filters", () => {
  const r = filterAtlas(data, { ...defaults, institution: 2, edgeLimit: 1 });
  assert.equal(r.edges.length, 2);
  assert.equal(r.selectedEdges.length, 1);
  assert.deepEqual(r.selectedEdges[0], { source: 1, target: 2, count: 2 });
  assert.equal(
    filterAtlas(data, {
      ...defaults,
      institution: 2,
      edgeLimit: 1,
      start: 2020,
    }).selectedEdges[0].count,
    1,
  );
  assert.equal(
    filterAtlas(data, { ...defaults, institution: 2, minPapers: 3 })
      .selectedEdges.length,
    0,
  );
});
test("named community color is retained when other research has the largest share", () => {
  const amended = {
    ...data,
    institutions: [
      node(0, [
        [2020, 0, 2],
        [2020, 1, 3],
        [2020, -1, 50],
      ]),
    ],
    collaborations: [],
  };
  const n = filterAtlas(amended, defaults).nodes[0];
  assert.equal(n.community, 1);
  assert.deepEqual(n.shares, [2, 3, 50]);
});

test("historical source totals retain the papers from 1988–1999", () => {
  for (const [dataset, expected] of [
    ["robotics", 6292],
    ["humanoid", 171],
  ]) {
    const atlas = JSON.parse(
      readFileSync(
        new URL(`../public/data/atlas_${dataset}.json`, import.meta.url),
      ),
    );
    const early = filterAtlas(atlas, {
      start: 1988,
      end: 1999,
      community: null,
      query: "",
      minPapers: 1,
      edgeLimit: 0,
      institution: null,
      neighborhood: false,
    });
    assert.equal(early.papers, expected);
    assert.ok(early.nodes.length > 0);
    assert.ok(early.edges.length > 0);
  }
});

test("map picking prioritizes paper counts across overlapping and coincident nodes", async () => {
  const { mapPicker } = await import("../src/mapInteraction.ts");
  const pick = mapPicker([
    { id: 1, x: 100, y: 100, radius: 9.5, count: 2500 },
    { id: 2, x: 105, y: 100, radius: 2, count: 20 },
    { id: 3, x: 100, y: 100, radius: 2, count: 5 },
    { id: 4, x: 125, y: 100, radius: 2, count: 10 },
  ]);
  assert.equal(pick(105, 100).id, 1);
  assert.equal(pick(100, 100).id, 1);
  assert.equal(pick(125, 100).id, 4);
  assert.equal(pick(300, 300), undefined);
});

test("co-located MIT institutions have stable offsets and separate zoomed click targets", async () => {
  const { locationOffsets, offsetSpacing, mapPicker } =
    await import("../src/mapInteraction.ts");
  const atlas = JSON.parse(
    readFileSync(
      new URL("../public/data/atlas_robotics.json", import.meta.url),
    ),
  );
  const mit = atlas.institutions.find((n) => n.label === "MIT");
  const group = atlas.institutions
    .filter((n) =>
      n.geo.every(
        (coordinate, axis) => Math.abs(coordinate - mit.geo[axis]) < 1e-6,
      ),
    )
    .map((n) => ({
      id: n.id,
      geo: n.geo,
      papers: n.counts.reduce((sum, [, , count]) => sum + count, 0),
    }));
  assert.ok(group.length > 2);
  const offsets = locationOffsets(group);
  assert.deepEqual(offsets, locationOffsets([...group].reverse()));
  assert.deepEqual(offsets.get(mit.id), [0, 0]);
  assert.equal(offsetSpacing(1), 0);
  const marks = group.map((n) => ({
    id: n.id,
    x: offsets.get(n.id)[0] * offsetSpacing(512),
    y: offsets.get(n.id)[1] * offsetSpacing(512),
    radius:
      1.5 +
      Math.sqrt(n.papers / mit.counts.reduce((sum, [, , c]) => sum + c, 0)) * 8,
    count: n.papers,
  }));
  const pick = mapPicker(marks);
  for (const mark of marks) assert.equal(pick(mark.x, mark.y).id, mark.id);
});

test("co-located markers stay compact until close zoom, then separate smoothly", async () => {
  const { offsetSpacing } = await import("../src/mapInteraction.ts");
  for (const zoom of [1, 2, 4, 8, 12]) assert.equal(offsetSpacing(zoom), 0);
  const levels = [12, 16, 24, 32, 48, 64, 96, 128, 256, 384, 512].map(
    offsetSpacing,
  );
  levels.slice(1).forEach((value, i) => assert.ok(value > levels[i]));
  assert.ok(offsetSpacing(128) < 2);
  const steps = [128, 256, 384, 512].map(offsetSpacing);
  assert.ok(steps[3] - steps[2] > steps[2] - steps[1]);
  assert.ok(steps[2] - steps[1] > steps[1] - steps[0]);
  assert.equal(offsetSpacing(512), 12);
  assert.equal(offsetSpacing(1024), 12);
});
