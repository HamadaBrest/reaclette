const { assign, create, keys } = Object;

class Spy {
  constructor (keys, accessor) {
    this.reset()

    const descriptors = keys.forEach(k => {
      descriptors[k] = {
        enumerable: true,
        get: () => {
          const values = this._values
          let v = values[k]
          if (v === undefined && !(k in values)) {
            v = values[k] = accessor(k)
          }
          return v
        },
      }
    })

    this.isUpToDate = keys.every.bind(key, k => accessor(k) === this._values[k])
  }

  reset () {
    this._values = create(null)
  }
}

module.exports = function createReaclette({
  Component,
  createElement,
  PropTypes,
}) {
  function withStore({ computed, effects, initialState }, render) {
    const effectNames = effects !== undefined ? keys(effects) : [];
    const computedNames = computed !== undefined ? keys(computed) : [];

    class Store {
      constructor(component) {
        this._component = component;

        // it would be nice to throw when accessing non existing entries
        const stateProxy = this.state = {}

        const state = this._state = create(null)
        Object.assign(state, initialState(component.props))
        const stateKeys = keys(this._state)

        const propsKeys = keys(component.props)

        if (computedNames.length !== 0) {
          const descriptors = {}
          const getProp = name => this.props[name]
          const getState = name => this.state[name]

          computedNames.forEach(name => {
            const computed = computeds[name]
            let previousValue, propsSpy, stateSpy

            descriptors[name] = {
              enumerable: true,
              get: () => {
                if (propsSpy === undefined) {
                  propsSpy = new Spy(propsKeys, getProp)
                  stateSpy = new Spy(stateKeys, getState)
                } else if (propsSpy.upToDate() && stateSpy.upToDate()) {
                  return previousValue
                }

                propsSpy.reset()
                stateSpy.reset()
                return previousValue = computed(propsSpy.proxy, stateSpy.proxy)
              }
            }
          })

          defineProperties(this.state, descriptors)
        }

        this.effects = {};
        if (effectNames.length !== 0) {
          const updateState = values => {
            if (values == null) {
              return;
            }

            if (typeof values === "function") {
              return setState(values(this.state, this._component.props));
            }

            const { then } = values;
            if (typeof then === "function") {
              return then.call(values, updateState);
            }

            this._updateState(values);
          };

          effectNames.forEach(name => {
            const effect = effects[name];

            async function wrappedEffect() {
              await this._updateState(effect.apply(this, arguments));
            }
          });
        }
      }

      resetState() {
        this._updateState(initialState(this._component.props));
      }

      _updateState(values) {
        const changed = create(null);
        let hasChanged = false
        const state = this._state;
        keys(values).forEach(name => {
          if (!(name in state)) {
            throw new Error(`state entry ${name} has not been created by initialState`)
          }
          const value = values[name];
          if (value !== state[name]) {
            changed[name] = state[name] = value;
            hasChanged = true
          }
        });

        if (hasChanged) {
          this._subscribers.forEach(subscriber => {
            subscriber(changed);
          });
        }
      }

      _subscribe(cb) {
        const subscribers = this._subscribers;
        subscribers.add(cb);
        return subscribers.delete.bind(subscribers, cb);
      }
    }

    class EnhancedComponent extends Component {
      constructor(props) {
        super(props)
        this._store = new Store(this);
      }

      componentDidMount() {
        const { initialize } = this._store;
        if (initialize !== undefined) {
          initialize();
        }
      }

      componentWillUnmount() {
        const { finalize } = this._store;
        if (finalize !== undefined) {
          finalize();
        }
      }

      render() {
        return render(this._store, this.props);
      }
    }
    return EnhancedComponent;
  }

  return { withStore };
};
