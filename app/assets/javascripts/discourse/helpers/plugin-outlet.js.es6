/**
   A plugin outlet is an extension point for templates where other templates can
   be inserted by plugins.

   ## Usage

   If you handlebars template has:

   ```handlebars
     {{plugin-outlet "evil-trout"}}
   ```

   Then any handlebars files you create in the `connectors/evil-trout` directory
   will automatically be appended. For example:

   plugins/hello/assets/javascripts/discourse/templates/connectors/evil-trout/hello.hbs

   With the contents:

   ```handlebars
     <b>Hello World</b>
   ```

   Will insert <b>Hello World</b> at that point in the template.

   Optionally you can also define a view class for the outlet as:

   plugins/hello/assets/javascripts/discourse/views/connectors/evil-trout/hello.js.es6

   And it will be wired up automatically.

   ## The block form

   If you use the block form of the outlet, its contents will be displayed
   if no connectors are found. Example:

   ```handlebars
     {{#plugin-outlet "hello-world"}}
       Nobody says hello :'(
     {{/plugin-outlet}}
   ```

   ## Disabling

   If a plugin returns a disabled status, the outlets will not be wired up for it.
   The list of disabled plugins is returned via the `Site` singleton.

**/

let _connectorCache;

function findOutlets(collection, callback) {

  const disabledPlugins = Discourse.Site.currentProp('disabled_plugins') || [];

  Ember.keys(collection).forEach(function(res) {
    if (res.indexOf("/connectors/") !== -1) {
      // Skip any disabled plugins
      for (let i=0; i<disabledPlugins.length; i++) {
        if (res.indexOf("/" + disabledPlugins[i] + "/") !== -1) {
          return;
        }
      }

      const segments = res.split("/"),
            outletName = segments[segments.length-2],
            uniqueName = segments[segments.length-1];

      callback(outletName, res, uniqueName);
    }
  });
}

function buildConnectorCache() {
  _connectorCache = {};

  const uniqueViews = {};
  findOutlets(requirejs._eak_seen, function(outletName, resource, uniqueName) {
    _connectorCache[outletName] = _connectorCache[outletName] || [];

    const viewClass = require(resource, null, null, true).default;
    uniqueViews[uniqueName] = viewClass;
    _connectorCache[outletName].pushObject(viewClass);
  });

  findOutlets(Ember.TEMPLATES, function(outletName, resource, uniqueName) {
    _connectorCache[outletName] = _connectorCache[outletName] || [];

    const mixin = {templateName: resource.replace('javascripts/', '')};
    let viewClass = uniqueViews[uniqueName];

    if (viewClass) {
      // We are going to add it back with the proper template
      _connectorCache[outletName].removeObject(viewClass);
    } else {
      viewClass = Em.View.extend({ classNames: [outletName + '-outlet', uniqueName] });
    }
    _connectorCache[outletName].pushObject(viewClass.extend(mixin));
  });
}

export default function(connectionName, options) {
  if (!_connectorCache) { buildConnectorCache(); }

  if (_connectorCache[connectionName]) {
    const childViews = _connectorCache[connectionName];

    // If there is more than one view, create a container. Otherwise
    // just shove it in.
    const viewClass = (childViews.length > 1) ? Ember.ContainerView : childViews[0];

    delete options.fn;  // we don't need the default template since we have a connector
    Ember.Handlebars.helpers.view.call(this, viewClass, options);

    const cvs = options.data.view._childViews;
    if (childViews.length > 1 && cvs && cvs.length) {
      const inserted = cvs[cvs.length-1];
      if (inserted) {
        childViews.forEach(function(cv) {
          inserted.pushObject(cv.create());
        });
      }
    }
  } else if (options.fn) {
    // If a block is passed, render its content.
    return Ember.Handlebars.helpers.view.call(this,
              Ember.View.extend({
                isVirtual: true,
                tagName: '',
                template: function() {
                  return options.hash.template;
                }.property()
              }),
            options);
  }
}
