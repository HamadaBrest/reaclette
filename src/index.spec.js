/* eslint-env jest */

require("raf/polyfill");
const { createElement } = require("react");
const { configure, mount } = require("enzyme");

const { withStore } = require("./");
const CircularComputedError = require("./_CircularComputedError");

configure({ adapter: new (require("enzyme-adapter-react-16"))() });

const makeTestInstance = (opts, props) => {
  let renderCount = 0;
  let renderArgs;
  const parent = mount(
    createElement(
      withStore(
        {
          ...opts,
          effects: {
            ...opts.effects,
            _setState(props) {
              Object.assign(this.state, props);
            },
          },
        },
        (...args) => {
          ++renderCount;
          renderArgs = args;
          return null;
        }
      ),
      props
    )
  );
  return {
    effects: renderArgs[0].effects,
    getParentProps: () => parent.instance().props,
    getRenderArgs: () => renderArgs,
    getRenderCount: () => renderCount,
    getState: () => renderArgs[0].state,
    setParentProps: parent.setProps.bind(parent),
  };
};

const noop = () => {};

describe("withStore", () => {
  describe("render function", () => {
    it("receives the store as first param with effects, state and resetState", async () => {
      const { getRenderArgs } = makeTestInstance({
        initialState: () => ({
          foo: "bar",
        }),
        effects: {
          changeState(value) {
            this.state.foo = value;
          },
        },
      });

      expect(getRenderArgs()[0]).toHaveProperty("effects");
      expect(getRenderArgs()[0]).toHaveProperty("resetState");
      expect(getRenderArgs()[0]).toHaveProperty("state");
    });

    it("receives the props as second param", () => {
      const props = { bar: "baz" };
      const { getRenderArgs } = makeTestInstance(
        {
          initialState: () => ({
            foo: "bar",
          }),
          effects: {
            changeState(value) {
              this.state.foo = value;
            },
          },
        },
        props
      );
      expect(getRenderArgs()[1]).toHaveProperty("bar");
    });

    it("returns the React tree to render", () => {
      // SKIPPED
    });
  });

  describe("computed", () => {
    it("can read state and computed entries", () => {
      const { getState } = makeTestInstance({
        initialState: () => ({
          foo: "bar",
        }),
        computed: {
          qux: ({ foo }) => foo,
          corge: ({ qux }) => qux,
        },
      });

      expect(getState().qux).toBe("bar");
      expect(getState().corge).toBe("bar");
    });

    it("cannot write state", () => {
      const { getState } = makeTestInstance({
        initialState: () => ({
          foo: "bar",
        }),
        computed: {
          qux: ({ foo }) => {
            this.state.foo = "fred";
            return foo;
          },
        },
      });

      expect(() => getState().qux).toThrowError(
        new TypeError("Cannot set property 'foo' of undefined")
      );
    });

    it("cannot write computed entries", () => {
      const { getState } = makeTestInstance({
        initialState: () => ({
          foo: "bar",
        }),
        computed: {
          qux: ({ foo }) => foo,
          corge: ({ qux }) => {
            this.state.qux = "thud";
            return qux;
          },
        },
      });

      expect(() => {
        return getState().corge;
      }).toThrowError(new TypeError("Cannot set property 'qux' of undefined"));
    });

    it("cannot add new state entries", () => {
      const { getState } = makeTestInstance({
        initialState: () => ({}),
        computed: {
          qux: () => {
            this.state.corge = "baz";
          },
        },
      });

      expect(() => {
        return getState().qux;
      }).toThrowError(
        new TypeError("Cannot set property 'corge' of undefined")
      );
    });

    it("cannot access itself", () => {
      const { getState } = makeTestInstance({
        initialState: () => ({}),
        computed: {
          circularComputed: ({ circularComputed }) => {},
        },
      });

      expect(() => {
        return getState().circularComputed;
      }).toThrowError(new CircularComputedError("circularComputed"));
    });

    it("can read props", () => {
      const props = { bar: 2 };
      const { getState } = makeTestInstance(
        {
          initialState: () => ({}),
          computed: {
            baz: (_, { bar }) => bar * 2,
          },
        },
        props
      );

      expect(getState().baz).toBe(4);
    });

    it("are not called when its state/props dependencies do not change", async () => {
      const baz = jest.fn(({ qux }, { bar }) => bar * qux);
      const props = { bar: 2, thud: 9 };
      const { effects, getState, setParentProps } = makeTestInstance(
        {
          initialState: () => ({ qux: 1, corge: 4 }),
          effects: {
            changeState() {
              this.state.corge = 8;
            },
          },
          computed: {
            baz,
          },
        },
        props
      );

      setParentProps({ thud: 8 });
      await effects.changeState();
      noop(getState().baz);
      expect(baz.mock.calls.length).toBe(1);
    });

    it("is called when its state dependencies change", async () => {
      const baz = jest.fn(({ bar }) => bar * 2);
      const { effects, getState } = makeTestInstance({
        initialState: () => ({ bar: 3 }),
        effects: {
          changeState() {
            this.state.bar = 5;
          },
        },
        computed: {
          baz,
        },
      });

      expect(getState().baz).toBe(6);
      await effects.changeState();
      expect(getState().baz).toBe(10);
      expect(baz).toHaveBeenCalledTimes(2);
    });

    it("is called when its props dependencies change", async () => {
      const baz = jest.fn((_, { qux }) => qux * 2);
      const props = { qux: 2 };
      const { getState, setParentProps } = makeTestInstance(
        {
          initialState: () => ({ bar: 3 }),
          computed: {
            baz,
          },
        },
        props
      );

      expect(getState().baz).toBe(4);
      setParentProps({ qux: 4 });
      expect(getState().baz).toBe(8);
      expect(baz).toHaveBeenCalledTimes(2);
    });

    it("can be async", async () => {
      const baz = jest.fn(() => Promise.resolve(5));
      const { getState } = makeTestInstance({
        initialState: () => ({}),
        computed: {
          baz,
        },
      });
      expect(getState().baz).toBe(undefined);
      await noop(getState().baz);
      expect(getState().baz).toBe(5);
    });
  });

  describe("effects", () => {
    it("receives the passed arguments", () => {
      const args = ["bar", "baz"];
      const { effects } = makeTestInstance({
        effects: {
          foo: (...rest) => {
            expect(rest).toEqual(args);
          },
        },
      });
      return effects.foo(...args);
    });

    it("are called with effects, props and state in context", () => {
      const state = { foo: "bar" };
      const { effects, getParentProps } = makeTestInstance({
        initialState: () => state,
        effects: {
          foo() {
            expect(this.effects).toBe(effects);
            expect(this.props).toBe(getParentProps());
            expect(state.foo).toEqual(this.state.foo);
          },
        },
      });
      return effects.foo();
    });

    it("cannot write computed entries", () => {
      const { effects } = makeTestInstance({
        initialState: () => ({ foo: "bar" }),
        effects: {
          foo() {
            this.state.qux = "plugh";
            expect(this.state.qux).toBe("bar");
          },
        },
        computed: {
          qux: ({ foo }) => foo,
        },
      });
      return effects.foo();
    });

    it("cannot set new state entries", () => {
      const { effects } = makeTestInstance({
        initialState: () => ({}),
        effects: {
          foo() {
            this.state.garply = "fred";
            expect(this.state.garply).toBe(undefined);
          },
        },
      });
      return effects.foo();
    });

    it("can use other effects", () => {
      const { effects } = makeTestInstance({
        initialState: () => ({ qux: "thud " }),
        effects: {
          async foo() {
            await this.effects.bar();
            expect(this.state.qux).toBe("fred");
          },
          bar() {
            this.state.qux = "fred";
          },
        },
      });
      return effects.foo();
    });

    it("cannot set effects", () => {
      const { effects } = makeTestInstance({
        initialState: () => ({ qux: "thud" }),
        effects: {
          async foo() {
            this.effects.bar = () => {
              this.state.qux = "plugh";
            };
            await this.effects.bar();
            expect(this.state.qux).toBe("fred");
          },
          bar() {
            this.state.qux = "fred";
          },
        },
      });
      return effects.foo();
    });

    it("cannot add new effects", () => {
      const { effects } = makeTestInstance({
        initialState: () => ({ qux: "thud" }),
        effects: {
          foo() {
            this.effects.waldo = () => {
              this.state.qux = "plugh";
            };
            expect(() => this.effects.waldo()).toThrow();
          },
        },
      });
      return effects.foo();
    });

    it("can call reset state", () => {
      const { effects } = makeTestInstance({
        initialState: () => ({ qux: "thud" }),
        effects: {
          async foo() {
            this.state.qux = "baz";
            this.resetState();
            expect(this.state.qux).toBe("thud");
          },
        },
      });
      return effects.foo();
    });

    it("can call reset state", () => {
      const { effects } = makeTestInstance({
        initialState: () => ({ qux: "thud" }),
        effects: {
          async foo() {
            this.state.qux = "baz";
            this.resetState();
            expect(this.state.qux).toBe("thud");
          },
        },
      });
      return effects.foo();
    });

    it("can be async", () => {
      const { effects, getState } = makeTestInstance({
        initialState: () => ({ qux: "thud " }),
        effects: {
          async foo() {
            await this.effects.bar();
          },
          bar() {
            this.state.qux = "fred";
          },
        },
      });
      return expect(effects.foo().then(() => getState().qux)).resolves.toBe(
        "fred"
      );
    });
  });
});
