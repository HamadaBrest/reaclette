import delay from "promise-toolbox/delay";
import React from "react";
import { render } from "react-dom";
import { State } from "reaclette";
import { format, parse } from "json-rpc-protocol";

class ApiClient {
  constructor(url) {
    this._url = url;
  }

  async call(method, params = {}) {
    return parse.response(
      await (await fetch.post(url, {
        body: format.request(0, method, params),
      })).text()
    );
  }
}

const TodoForm = withStore({
  initialState: () => ({
    name: "",
    running: false,
  }),
  effects: {
    onNameChange: ({ target: { value } }) => ({ name: value }),
    async onSubmit(event) {
      event.preventDefault();

      const { state } = this;
      try {
        state.running = true;
        await this.props.createEntry(state.name);
        state.name = "";
      } catch (error) {
        console.warn(error);
      } finally {
        state.running = false;
      }
    },
  },
}, ({ effects, state }) => (
  <form onSubmit={effects.onSubmit}>
    <input value={state.name} onChange={effects.onNameChange} />
    <button>Create</button>
  </form>
));

const TodoListState = new State({
  computed: {
    todos: {
      async *value(_, { client, refreshDelay = 5e3 }) {
        while (true) {
          yield client.call("listEntries");
          await delay(refreshDelay);
        }
      },
      placeholder: [],
    },
  },
  effects: {
    async createEntry(name) {
      await client.call("createEntry", { name });
    },
  },
});

const TodoList = TodoListState.wrap(({ effects, state }) => (
  <div>
    <ul>
      {state.todos.map(todo => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
    <TodoForm createEntry={effects.createEntry} />
  </div>
));

render(<TodoList client={new ApiClient("/api/")} />, document.body);

// possible
const S = (withStore => {
  const { Consumer, Provider } = React.createContext();

  return {
    Consumer,
    MockProvider: Provider,
    Provider: withStore(({ children }, store) => (
      <Provider value={store}>{children}</Provider>
    )),
  };
})(
  createStore({
    initialState: () => ({}),
    effects: {},
    computed: {},
  })
);
