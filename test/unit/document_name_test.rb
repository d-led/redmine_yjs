# frozen_string_literal: true

# Runs without Redmine: `ruby test/unit/document_name_test.rb`
require 'minitest/autorun'
require_relative '../../lib/redmine_yjs/document_name'

class DocumentNameTest < Minitest::Test
  DocumentName = RedmineYjs::DocumentName

  def test_an_issue_is_its_own_document
    assert_equal 'issue-7', DocumentName.for(issue_id: 7)
  end

  def test_a_wiki_page_is_scoped_to_project_page_and_content_field
    assert_equal 'wiki-1-2-content_text', DocumentName.for(project_id: 1, wiki_page_id: 2)
  end

  def test_a_wiki_page_without_an_id_uses_its_sanitized_title
    document = DocumentName.for(project_id: 1, wiki_page_title: 'Release Notes!')

    assert_equal 'wiki-1-release-notes--content_text', document
  end

  def test_an_issue_wins_over_the_project_it_belongs_to
    document = DocumentName.for(project_id: 1, issue_id: 7)

    assert_equal 'issue-7', document
  end

  def test_a_wiki_page_wins_over_the_project_it_belongs_to
    document = DocumentName.for(project_id: 1, wiki_page_title: 'Home')

    assert_equal 'wiki-1-home-content_text', document
  end

  def test_a_project_alone_is_a_project_document
    assert_equal 'project-3', DocumentName.for(project_id: 3)
  end

  def test_a_wiki_page_in_an_unknown_project_still_gets_a_stable_name
    assert_equal 'wiki-0-home-content_text', DocumentName.for(wiki_page_title: 'Home')
  end

  def test_string_keys_are_accepted_like_symbol_keys
    document = DocumentName.for('project_id' => 1, 'wiki_page_id' => 2)

    assert_equal 'wiki-1-2-content_text', document
  end

  def test_blank_values_do_not_create_a_document
    assert_nil DocumentName.for(project_id: '', issue_id: nil, wiki_page_title: '  ')
  end

  def test_no_context_means_no_document
    assert_nil DocumentName.for({})
    assert_nil DocumentName.for(nil)
  end

  def test_the_name_is_a_string_the_token_can_be_signed_for
    document = DocumentName.for(wiki_page_id: 2, project_id: 1)

    assert_kind_of String, document
    assert_match(/\Awiki-1-2-content_text\z/, document)
  end
end
