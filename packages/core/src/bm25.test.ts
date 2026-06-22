import { describe, it, expect } from "vitest"
import { BM25, tokenize } from "./bm25.js"

describe("tokenize", () => {
  it("splits camelCase", () => {
    expect(tokenize("getUserById")).toContain("get")
    expect(tokenize("getUserById")).toContain("user")
    expect(tokenize("getUserById")).toContain("id")
  })

  it("splits snake_case", () => {
    expect(tokenize("compute_bunkerul_signal")).toContain("compute")
    expect(tokenize("compute_bunkerul_signal")).toContain("bunkerul")
    expect(tokenize("compute_bunkerul_signal")).toContain("signal")
  })

  it("removes stop words", () => {
    const tokens = tokenize("the function returns a value")
    expect(tokens).not.toContain("the")
    expect(tokens).not.toContain("function")
    expect(tokens).not.toContain("returns")
  })

  it("removes short tokens", () => {
    const tokens = tokenize("a is it go")
    for (const t of tokens) {
      expect(t.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe("BM25", () => {
  it("scores relevant document higher", () => {
    const docs = [
      "func Login(user string) error { return auth.Validate(user) }",
      "func RenderTemplate(name string) []byte { return templates[name] }",
      "func MigrateDatabase(db *sql.DB) error { return migrate.Up(db) }",
    ]
    const scorer = new BM25(docs)
    const scores = scorer.scoreAll("login authentication user validate")

    expect(scores[0]?.index).toBe(0)
    expect(scores[0]?.score).toBeGreaterThan(0)
  })

  it("returns zero score for empty query", () => {
    const scorer = new BM25(["some content"])
    const scores = scorer.scoreAll("")
    expect(scores[0]?.score).toBe(0)
  })

  it("handles empty docs array", () => {
    const scorer = new BM25([])
    expect(scorer.scoreAll("query")).toHaveLength(0)
  })
})
