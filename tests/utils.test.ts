/**
 * Tests for utility functions in the Impetus framework
 * 
 * This test suite verifies that all utility functions work correctly.
 * Utility functions are the building blocks that the framework relies on,
 * so it's critical that they handle all edge cases properly.
 * 
 * The tests cover:
 * - String case conversion (camelCase ↔ kebab-case)
 * - Type coercion from strings
 * - Class and style normalization
 * - Expression parsing and manipulation
 * - Directive detection
 * - Props parsing from DOM elements
 * - DOM traversal helpers
 */

import { expect, test, describe } from "./setup";
import {
  toCamel,
  toKebab,
  coerce,
  normalizeClass,
  normalizeStyle,
  unwrapExpr,
  hasBraces,
  isDirective,
  shouldBindAttr,
  isPlainObject,
  parseProps,
  parseEachExpression,
  setBooleanProp,
  setValueProp,
  isInsideEachTemplate,
  findElseSibling
} from "../src/utils";
import { DIRECTIVES } from "../src/constants";

describe("Utils", () => {
  describe("toCamel", () => {
    /**
     * Test basic kebab-case to camelCase conversion
     * 
     * This is the most common use case - converting HTML attribute names
     * to JavaScript property names.
     */
    test.each([
      ["hello-world", "helloWorld"],
      ["data-user-id", "dataUserId"],
      ["aria-label", "ariaLabel"],
      ["single", "single"],
      ["", ""],
      ["camelCase", "camelCase"],
      ["multiple--dashes", "multipleDashes"],
      ["trailing-", "trailing"],
      ["-leading", "Leading"]
    ])("toCamel(%s)", (input, expected) => {
      expect(toCamel(input)).toBe(expected);
    });
  });

  describe("toKebab", () => {
    /**
     * Test basic camelCase to kebab-case conversion
     * 
     * This is used when converting JavaScript property names to CSS names.
     * The improved implementation handles consecutive uppercase letters.
     */
    test.each([
      ["helloWorld", "hello-world"],
      ["userId", "user-id"],
      ["HTMLElement", "html-element"],
      ["single", "single"],
      ["", ""],
      ["kebab-case", "kebab-case"],
      ["test123Value", "test123-value"],
      ["XMLHttpRequest", "xml-http-request"]
    ])("toKebab(%s)", (input, expected) => {
      expect(toKebab(input)).toBe(expected);
    });
  });

  describe("coerce", () => {
    /**
     * Test type coercion from string values
     * 
     * HTML attributes are always strings, but we need them as proper types.
     * The order of checks is important to avoid false positives.
     */
    test.each([
      ["true", true],
      ["false", false],
      ["null", null],
      ["undefined", undefined],
      ["123", 123],
      ["12.34", 12.34],
      ["0", 0],
      ["", ""],
      ["hello", "hello"],
      ["  123  ", 123],
      ["   ", "   "],
      ["-42", -42],
      ["3.14", 3.14]
    ])("coerce('%s')", (input, expected) => {
      expect(coerce(input)).toBe(expected);
    });
  });

  describe("normalizeClass", () => {
    /**
     * Test class value normalization to strings
     * 
     * The function should handle strings, arrays, objects, and other types.
     * Falsy values should be filtered out appropriately.
     */
    test("normalizes class values to strings", () => {
      expect(normalizeClass("hello world")).toBe("hello world");
      expect(normalizeClass(["hello", "world", null, ""])).toBe("hello world");
      expect(normalizeClass({ hello: true, world: false, test: true })).toBe("hello test");
      expect(normalizeClass({})).toBe("");
      expect(normalizeClass(null)).toBe("");
      expect(normalizeClass(undefined)).toBe("");
      expect(normalizeClass(123)).toBe("123");
    });

    /**
     * Test edge cases including nested arrays and truthy values
     * 
     * These ensure the function handles complex input structures.
     */
    test("handles edge cases", () => {
      expect(normalizeClass([["a", "b"], "c"])).toBe("a b c");
      expect(normalizeClass(["a", false, "b", null, "c", undefined])).toBe("a b c");
      expect(normalizeClass({ a: true, b: 1, c: 0 })).toBe("a b");
    });
  });

  describe("normalizeStyle", () => {
    /**
     * Test style value normalization to CSS strings
     * 
     * The function should handle both string and object inputs.
     * Null and false values should be excluded from the output.
     */
    test("normalizes style values to CSS strings", () => {
      expect(normalizeStyle("color: red; background: blue")).toBe("color: red; background: blue");
      expect(normalizeStyle({ color: "red", background: "blue" })).toBe("color:red;background:blue");
      expect(normalizeStyle({ color: null, background: false, display: "block" })).toBe("display:block");
      expect(normalizeStyle({})).toBe("");
      expect(normalizeStyle(null)).toBe("");
      expect(normalizeStyle(undefined)).toBe("");
      expect(normalizeStyle("color: red;")).toBe("color: red;"); // Trailing semicolon preserved in string input
    });

    /**
     * Test edge cases with camelCase property names
     * 
     * These ensure JavaScript property names are converted to CSS names.
     */
    test("handles edge cases", () => {
      expect(normalizeStyle({ 
        fontSize: "14px", 
        backgroundColor: "red" 
      })).toBe("font-size:14px;background-color:red");
      expect(normalizeStyle({ 
        opacity: 0, 
        zIndex: 1 
      })).toBe("opacity:0;z-index:1");
      expect(normalizeStyle({ 
        marginTop: "10px",
        paddingLeft: "5px"
      })).toBe("margin-top:10px;padding-left:5px");
    });
  });

  describe("unwrapExpr", () => {
    /**
     * Test expression unwrapping (removing outer braces)
     * 
     * This function should handle single and double braces,
     * as well as whitespace around the expression.
     */
    test("removes surrounding braces from expressions", () => {
      expect(unwrapExpr("{hello}")).toBe("hello");
      expect(unwrapExpr("{{hello}}")).toBe("hello");
      expect(unwrapExpr("hello")).toBe("hello");
      expect(unwrapExpr(" { hello } ")).toBe("hello");
      expect(unwrapExpr("")).toBe("");
      expect(unwrapExpr(null as any)).toBe("");
    });

    /**
     * Test edge cases with empty braces and whitespace
     * 
     * These ensure the function handles unusual but valid inputs.
     */
    test("handles edge cases", () => {
      expect(unwrapExpr("{}")).toBe("");
      expect(unwrapExpr("{{nested}}")).toBe("nested");
      expect(unwrapExpr("  { expression }  ")).toBe("expression");
      expect(unwrapExpr("plain expression")).toBe("plain expression");
    });
  });

  describe("hasBraces", () => {
    /**
     * Test brace detection in strings
     * 
     * This is used to determine if an attribute contains expressions.
     */
    test("checks if string contains braces", () => {
      expect(hasBraces("hello {world}")).toBe(true);
      expect(hasBraces("{hello}")).toBe(true);
      expect(hasBraces("hello world")).toBe(false);
      expect(hasBraces("")).toBe(false);
      expect(hasBraces(null)).toBe(false);
    });
  });

  describe("isDirective", () => {
    /**
     * Test directive identification
     * 
     * Both s-* and @* variants should be recognized.
     * Regular attributes should not be identified as directives.
     */
    test("identifies directive names", () => {
      expect(isDirective("s-if")).toBe(true);
      expect(isDirective("@if")).toBe(true);
      expect(isDirective("s-show")).toBe(true);
      expect(isDirective("@show")).toBe(true);
      expect(isDirective("s-else")).toBe(true);
      expect(isDirective("@else")).toBe(true);
      expect(isDirective("s-each")).toBe(true);
      expect(isDirective("@each")).toBe(true);
      expect(isDirective("s-transition")).toBe(true);
      expect(isDirective("@transition")).toBe(true);
      expect(isDirective("class")).toBe(false);
      expect(isDirective("value")).toBe(false);
      expect(isDirective("onclick")).toBe(false);
    });
  });

  describe("shouldBindAttr", () => {
    /**
     * Test attribute binding determination
     * 
     * This function decides which attributes need reactive updates.
     * The rules are: directives always bind, form attributes always bind,
     * class/style bind only with expressions, others bind only with expressions.
     */
    test("determines if attribute should be bound", () => {
      expect(shouldBindAttr("s-if", "true")).toBe(true);
      expect(shouldBindAttr("@show", "visible")).toBe(true);
      expect(shouldBindAttr("value", "{count}")).toBe(true);
      expect(shouldBindAttr("disabled", null)).toBe(true);
      expect(shouldBindAttr("checked", null)).toBe(true);
      expect(shouldBindAttr("class", "{active: true}")).toBe(true);
      expect(shouldBindAttr("style", "{color: 'red'}")).toBe(true);
      expect(shouldBindAttr("class", "static")).toBe(false);
      expect(shouldBindAttr("style", "static")).toBe(false);
      expect(shouldBindAttr("href", "{url}")).toBe(true);
      expect(shouldBindAttr("href", "static")).toBe(false);
    });
  });

  describe("isPlainObject", () => {
    /**
     * Test plain object identification
     * 
     * Plain objects are those created with {} or Object.create(null).
     * Arrays, dates, and other object types should not be considered plain.
     */
    test("identifies plain objects", () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ hello: "world" })).toBe(true);
      expect(isPlainObject(Object.create(null))).toBe(true);
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject("string")).toBe(false);
      expect(isPlainObject(123)).toBe(false);
    });
  });

  describe("parseEachExpression", () => {
    /**
     * Test @each expression parsing
     * 
     * The function should extract the list expression, item key, and index key.
     * Default values should be used when the "as" clause is omitted.
     */
    test("parses each expressions", () => {
      expect(parseEachExpression("items")).toEqual({
        listExpr: "items",
        itemKey: "item",
        idxKey: "i"
      });
      
      expect(parseEachExpression("items as user")).toEqual({
        listExpr: "items",
        itemKey: "user",
        idxKey: "i"
      });
      
      expect(parseEachExpression("items as user, index")).toEqual({
        listExpr: "items",
        itemKey: "user",
        idxKey: "index"
      });
      
      expect(parseEachExpression("users as person, idx")).toEqual({
        listExpr: "users",
        itemKey: "person",
        idxKey: "idx"
      });
    });

    /**
     * Test edge cases with function calls and custom names
     * 
     * These ensure the function works with complex expressions.
     */
    test("handles edge cases", () => {
      expect(parseEachExpression("getFilteredItems() as item, idx")).toEqual({
        listExpr: "getFilteredItems()",
        itemKey: "item",
        idxKey: "idx"
      });
    });
  });

  describe("setBooleanProp", () => {
    /**
     * Test boolean property setting on elements
     * 
     * The function should convert values to boolean and set them.
     * It should not throw on invalid properties.
     */
    test("sets boolean properties on elements", () => {
      const div = document.createElement("div");
      
      setBooleanProp(div, "hidden", true);
      expect(div.hidden).toBe(true);
      
      setBooleanProp(div, "hidden", false);
      expect(div.hidden).toBe(false);
      
      // Should not throw on invalid property
      expect(() => setBooleanProp(div, "invalid", true)).not.toThrow();
    });
  });

  describe("setValueProp", () => {
    /**
     * Test value property setting on elements
     * 
     * The function should convert values to strings.
     * Null and undefined should become empty strings.
     */
    test("sets value properties on elements", () => {
      const input = document.createElement("input");
      
      setValueProp(input, "hello");
      expect(input.value).toBe("hello");
      
      setValueProp(input, null);
      expect(input.value).toBe("");
      
      setValueProp(input, undefined);
      expect(input.value).toBe("");
      
      setValueProp(input, 123);
      expect(input.value).toBe("123");
      
      // Should not throw on invalid element
      expect(() => setValueProp({} as any, "test")).not.toThrow();
    });
  });

  describe("parseProps", () => {
    /**
     * Test props parsing from DOM elements
     * 
     * The function should combine the "props" attribute with individual attributes.
     * Data and aria attributes keep their original names, others become camelCase.
     */
    test("parses component props from element", () => {
      const div = document.createElement("div");
      div.setAttribute("title", "Hello");
      div.setAttribute("data-id", "123");
      div.setAttribute("aria-label", "Test");
      div.setAttribute("disabled", "true");
      div.setAttribute("count", "42");
      div.setAttribute("props", '{"custom": "value"}');
      
      const props = parseProps(div);
      
      expect(props).toEqual({
        title: "Hello",
        "data-id": 123, // Note: data- and aria- attributes keep original names
        "aria-label": "Test", // Note: data- and aria- attributes keep original names
        disabled: true,
        count: 42,
        custom: "value"
      });
    });

    /**
     * Test invalid JSON handling
     * 
     * The function should not throw and should return empty props on error.
     */
    test("handles invalid props JSON", () => {
      const div = document.createElement("div");
      div.setAttribute("props", "invalid json");
      
      // Should not throw and should return empty props
      expect(() => parseProps(div)).not.toThrow();
    });

    /**
     * Test edge cases with mixed attribute types
     * 
     * These ensure the function handles various attribute formats correctly.
     */
    test("handles edge cases", () => {
      const div = document.createElement("div");
      div.setAttribute("props", '{"invalid": json}');
      
      const props = parseProps(div);
      expect(props).toEqual({});

      // Test data and aria attributes
      div.setAttribute("data-test", "value");
      div.setAttribute("aria-label", "label");
      
      const props2 = parseProps(div);
      expect(props2["data-test"]).toBe("value");
      expect(props2["aria-label"]).toBe("label");

      // Test mixed attribute types
      const div2 = document.createElement("div");
      div2.setAttribute("string-attr", "hello");
      div2.setAttribute("number-attr", "42");
      div2.setAttribute("boolean-attr", "true");
      
      const props3 = parseProps(div2);
      expect(props3.stringAttr).toBe("hello");
      expect(props3.numberAttr).toBe(42);
      expect(props3.booleanAttr).toBe(true);
    });
  });

  describe("DOM traversal utilities", () => {
    /**
     * Test isInsideEachTemplate function
     * 
     * This function checks if an element is inside an @each directive.
     * It should walk up the DOM tree to find parent elements with the directive.
     */
    test("isInsideEachTemplate", () => {
      const container = document.createElement("div");
      const eachDiv = document.createElement("div");
      eachDiv.setAttribute("s-each", "items");
      const childDiv = document.createElement("div");
      
      container.appendChild(eachDiv);
      eachDiv.appendChild(childDiv);
      
      expect(isInsideEachTemplate(childDiv)).toBe(true);
      expect(isInsideEachTemplate(eachDiv)).toBe(false);
      expect(isInsideEachTemplate(container)).toBe(false);
      expect(isInsideEachTemplate(null)).toBe(false);
    });

    /**
     * Test findElseSibling function
     * 
     * This function finds the next sibling with an @else directive.
     * It should only check the immediate next sibling.
     */
    test("findElseSibling", () => {
      const container = document.createElement("div");
      const ifDiv = document.createElement("div");
      ifDiv.setAttribute("s-if", "condition");
      const elseDiv = document.createElement("div");
      elseDiv.setAttribute("s-else", "");
      const otherDiv = document.createElement("div");
      
      container.appendChild(ifDiv);
      container.appendChild(elseDiv);
      container.appendChild(otherDiv);
      
      expect(findElseSibling(ifDiv)).toBe(elseDiv);
      expect(findElseSibling(elseDiv)).toBe(null);
      expect(findElseSibling(otherDiv)).toBe(null);
    });
  });
});
