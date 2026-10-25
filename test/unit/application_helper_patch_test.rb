# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class ApplicationHelperPatchTest < ActiveSupport::TestCase
  include RedmineYjs::ApplicationHelperPatch

  SECRET = 'a-secret-shared-with-hocuspocus'

  def setup
    Setting.plugin_redmine_yjs = { 'yjs_token_secret' => SECRET }
  end

  def teardown
    Setting.plugin_redmine_yjs = {}
  end

  def test_hocuspocus_url_helper_defined
    assert respond_to?(:hocuspocus_url)
  end

  def test_yjs_enabled_helper_defined
    assert respond_to?(:yjs_enabled?)
  end

  def test_token_names_the_document_the_browser_will_open
    payload = payload_of(yjs_hocuspocus_token(issue_id: 42))

    assert_equal 'issue-42', payload['doc']
  end

  def test_wiki_token_names_the_page_document
    payload = payload_of(yjs_hocuspocus_token(project_id: 1, wiki_page_id: 2))

    assert_equal 'wiki-1-2-content_text', payload['doc']
  end

  def test_token_is_signed_with_the_shared_secret
    payload_json, signature = yjs_hocuspocus_token(issue_id: 42).split('.')

    expected = OpenSSL::HMAC.digest('SHA256', SECRET, Base64.urlsafe_decode64(payload_json))

    assert_equal expected, Base64.urlsafe_decode64(signature)
  end

  def test_token_is_bound_to_the_current_user
    payload = payload_of(yjs_hocuspocus_token(issue_id: 42))

    assert_equal User.current.id, payload['uid']
  end

  def test_no_token_without_a_secret
    Setting.plugin_redmine_yjs = {}

    assert_nil yjs_hocuspocus_token(issue_id: 42)
  end

  def test_no_token_without_a_document
    assert_nil yjs_hocuspocus_token({})
  end

  private

  def payload_of(token)
    JSON.parse(Base64.urlsafe_decode64(token.split('.').first))
  end
end
