import { expect, test } from "bun:test";

function add(a: number, b: number) {
  return a + b;
}

test("add adds numbers", () => {
  expect(add(1, 2)).toBe(3);
});
