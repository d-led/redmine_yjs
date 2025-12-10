# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ApplicationHelperPatchTest < ActiveSupport::TestCase
  include ApplicationHelper

  def test_yjs_assets_helper_defined
    assert respond_to?(:yjs_assets)
  end

  def test_yjs_enabled_helper_defined
    assert respond_to?(:yjs_enabled?)
  end

  def test_yjs_document_context_helper_defined
    assert respond_to?(:yjs_document_context)
  end
end

