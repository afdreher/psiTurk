// Generated by CoffeeScript 1.6.1
(function() {
  var __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define(['underscore', 'backbone'], function(_, Backbone) {
    var AtAGlanceModel;
    return AtAGlanceModel = (function(_super) {

      __extends(AtAGlanceModel, _super);

      function AtAGlanceModel() {
        return AtAGlanceModel.__super__.constructor.apply(this, arguments);
      }

      AtAGlanceModel.prototype.url = '/at_a_glance_model';

      AtAGlanceModel.prototype.defaults = {
        balance: "$10,000"
      };

      return AtAGlanceModel;

    })(Backbone.Model);
  });

}).call(this);
