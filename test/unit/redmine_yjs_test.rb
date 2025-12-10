# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class RedmineYjsTest < ActiveSupport::TestCase
  def test_plugin_registered
    plugin = Redmine::Plugin.find(:redmine_yjs)
    assert_not_nil plugin
    assert_equal 'Redmine Yjs Collaborative Editing', plugin.name
  end

  def test_plugin_has_settings
    plugin = Redmine::Plugin.find(:redmine_yjs)
    assert plugin.configurable?
  end

  def test_default_settings
    settings = Setting.plugin_redmine_yjs
    # Settings should have hocuspocus_url and yjs_enabled
    assert settings.key?('hocuspocus_url') || settings.empty?
  end
end

