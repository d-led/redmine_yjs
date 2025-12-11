# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ApplicationHelperPatchTest < ActiveSupport::TestCase
  include RedmineYjs::ApplicationHelperPatch

  def test_hocuspocus_url_helper_defined
    assert respond_to?(:hocuspocus_url)
  end

  def test_yjs_enabled_helper_defined
    assert respond_to?(:yjs_enabled?)
  end

  def test_yjs_document_name_helper_defined
    assert respond_to?(:yjs_document_name)
  end

  def test_yjs_document_name_format
    name = yjs_document_name(1, 'issue', 42)
    assert_equal 'project-1-issue-42', name
  end
end
