# frozen_string_literal: true

# Runs without Redmine: `ruby test/unit/token_test.rb`
require 'minitest/autorun'
require_relative '../../lib/redmine_yjs/token'
require_relative '../../lib/redmine_yjs/document_name'

class TokenTest < Minitest::Test
  Token = RedmineYjs::Token

  SECRET = 'a-secret-only-redmine-and-hocuspocus-know'
  NOW = Time.utc(2026, 10, 25, 12, 0, 0)

  def issued_token(overrides = {})
    arguments = {
      user_id: 42,
      login: 'alice',
      document: 'wiki-1-2-content_text',
      secret: SECRET,
      now: NOW
    }

    Token.issue(**arguments.merge(overrides))
  end

  def payload_of(token)
    JSON.parse(decode(token.split('.').first))
  end

  def decode(encoded)
    Base64.urlsafe_decode64(encoded)
  end

  def test_the_token_names_the_document_it_was_issued_for
    assert_equal 'wiki-1-2-content_text', payload_of(issued_token)['doc']
  end

  def test_the_token_carries_the_user
    payload = payload_of(issued_token)

    assert_equal 42, payload['uid']
    assert_equal 'alice', payload['login']
  end

  def test_the_token_expires_ten_minutes_after_it_was_issued
    assert_equal NOW.to_i + 600, payload_of(issued_token)['exp']
  end

  def test_the_signature_is_the_hmac_of_the_payload
    payload_json, signature = issued_token.split('.')

    assert_equal OpenSSL::HMAC.digest('SHA256', SECRET, decode(payload_json)), decode(signature)
  end

  def test_another_secret_produces_another_signature
    _json, signature = issued_token.split('.')
    _other_json, other_signature = issued_token(secret: 'some-other-secret').split('.')

    refute_equal signature, other_signature
  end

  def test_the_encoded_token_has_no_padding_or_url_unsafe_characters
    assert_match(/\A[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\z/, issued_token)
  end

  def test_a_document_name_from_the_plugin_can_be_signed
    document = RedmineYjs::DocumentName.for(project_id: 1, issue_id: 7)

    assert_equal 'issue-7', payload_of(issued_token(document: document))['doc']
  end
end
