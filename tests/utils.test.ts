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
    test("converts kebab-case to camelCase", () => {
      expect(toCamel("hello-world")).toBe("helloWorld");
      expect(toCamel("data-user-id")).toBe("dataUserId");
      expect(toCamel("aria-label")).toBe("ariaLabel");
      expect(toCamel("single")).toBe("single");
      expect(toCamel("")).toBe("");
    });

    test("handles edge cases", () => {
      expect(toCamel("camelCase")).toBe("camelCase");
      expect(toCamel("multiple--dashes")).toBe("multipleDashes");
      expect(toCamel("trailing-")).toBe("trailing");
      expect(toCamel("-leading")).toBe("Leading");
    });
  });

  describe("toKebab", () => {
    test("converts camelCase to kebab-case", () => {
      expect(toKebab("helloWorld")).toBe("hello-world");
      expect(toKebab("userId")).toBe("user-id");
      expect(toKebab("HTMLElement")).toBe("html-element"); // Improved: handles consecutive uppercase letters
      expect(toKebab("single")).toBe("single");
      expect(toKebab("")).toBe("");
    });

    test("handles edge cases", () => {
      expect(toKebab("kebab-case")).toBe("kebab-case");
      expect(toKebab("test123Value")).toBe("test123-value");
      expect(toKebab("XMLHttpRequest")).toBe("xml-http-request");
    });
  });

  describe("coerce", () => {
    test("coerces string values to appropriate types", () => {
      expect(coerce("true")).toBe(true);
      expect(coerce("false")).toBe(false);
      expect(coerce("null")).toBe(null);
      expect(coerce("undefined")).toBe(undefined);
      expect(coerce("123")).toBe(123);
      expect(coerce("12.34")).toBe(12.34);
      expect(coerce("0")).toBe(0);
      expect(coerce("")).toBe("");
      expect(coerce("hello")).toBe("hello");
      expect(coerce("  123  ")).toBe(123);
    });

    test("handles edge cases", () => {
      expect(coerce("   ")).toBe("   ");
      expect(coerce("-42")).toBe(-42);
      expect(coerce("3.14")).toBe(3.14);
    });
  });

  describe("normalizeClass", () => {
    test("normalizes class values to strings", () => {
      expect(normalizeClass("hello world")).toBe("hello world");
      expect(normalizeClass(["hello", "world", null, ""])).toBe("hello world");
      expect(normalizeClass({ hello: true, world: false, test: true })).toBe("hello test");
      expect(normalizeClass({})).toBe("");
      expect(normalizeClass(null)).toBe("");
      expect(normalizeClass(undefined)).toBe("");
      expect(normalizeClass(123)).toBe("123");
    });

    test("handles edge cases", () => {
      expect(normalizeClass([["a", "b"], "c"])).toBe("a b c");
      expect(normalizeClass(["a", false, "b", null, "c", undefined])).toBe("a b c");
      expect(normalizeClass({ a: true, b: 1, c: 0 })).toBe("a b");
    });
  });

  describe("normalizeStyle", () => {
    test("normalizes style values to CSS strings", () => {
      expect(normalizeStyle("color: red; background: blue")).toBe("color: red; background: blue");
      expect(normalizeStyle({ color: "red", background: "blue" })).toBe("color:red;background:blue");
      expect(normalizeStyle({ color: null, background: false, display: "block" })).toBe("display:block");
      expect(normalizeStyle({})).toBe("");
      expect(normalizeStyle(null)).toBe("");
      expect(normalizeStyle(undefined)).toBe("");
      expect(normalizeStyle("color: red;")).toBe("color: red;"); // Fixed expectation
    });

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
    test("removes surrounding braces from expressions", () => {
      expect(unwrapExpr("{hello}")).toBe("hello");
      expect(unwrapExpr("{{hello}}")).toBe("hello");
      expect(unwrapExpr("hello")).toBe("hello");
      expect(unwrapExpr(" { hello } ")).toBe("hello");
      expect(unwrapExpr("")).toBe("");
      expect(unwrapExpr(null as any)).toBe("");
    });

    test("handles edge cases", () => {
      expect(unwrapExpr("{}")).toBe("");
      expect(unwrapExpr("{{nested}}")).toBe("nested");
      expect(unwrapExpr("  { expression }  ")).toBe("expression");
      expect(unwrapExpr("plain expression")).toBe("plain expression");
    });
  });

  describe("hasBraces", () => {
    test("checks if string contains braces", () => {
      expect(hasBraces("hello {world}")).toBe(true);
      expect(hasBraces("{hello}")).toBe(true);
      expect(hasBraces("hello world")).toBe(false);
      expect(hasBraces("")).toBe(false);
      expect(hasBraces(null)).toBe(false);
    });
  });

  describe("isDirective", () => {
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

    test("handles edge cases", () => {
      expect(parseEachExpression("getFilteredItems() as item, idx")).toEqual({
        listExpr: "getFilteredItems()",
        itemKey: "item",
        idxKey: "idx"
      });
    });
  });

  describe("setBooleanProp", () => {
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
        "data-id": 123, // Fixed: data- and aria- attributes keep original names
        "aria-label": "Test", // Fixed: data- and aria- attributes keep original names
        disabled: true,
        count: 42,
        custom: "value"
      });
    });

    test("handles invalid props JSON", () => {
      const div = document.createElement("div");
      div.setAttribute("props", "invalid json");
      
      // Should not throw and should return empty props
      expect(() => parseProps(div)).not.toThrow();
    });

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
