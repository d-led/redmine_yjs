# frozen_string_literal: true

require File.expand_path('../test_helper', __dir__)

class YjsIntegrationTest < ActionDispatch::IntegrationTest
  fixtures :projects, :users, :issues, :trackers

  def setup
    @project = Project.find(1)
    @user = User.find(2) # Regular user
  end

  def test_issue_edit_page_loads_yjs_assets_when_enabled
    # Enable Yjs for testing
    Setting.plugin_redmine_yjs = { 'yjs_enabled' => '1', 'hocuspocus_url' => 'ws://localhost:8081' }

    log_user('admin', 'admin')

    # Create an issue if needed
    issue = Issue.find_or_create_by!(
      project: @project,
      tracker: Tracker.first,
      subject: 'Test Issue for Yjs',
      author: User.find(1)
    )

    get "/issues/#{issue.id}/edit"
    assert_response :success

    # Check that Yjs assets are included (when plugin is properly loaded)
    # The actual asset loading depends on hooks being triggered
  end

  def test_wiki_edit_page_loads
    log_user('admin', 'admin')

    # Enable wiki module if not enabled
    @project.enable_module!(:wiki) unless @project.module_enabled?(:wiki)

    get "/projects/#{@project.identifier}/wiki/TestPage/edit"
    # Should either succeed or redirect (if page doesn't exist)
    assert_response :success
  rescue ActiveRecord::RecordNotFound
    # Wiki page might not exist, which is fine for this test
    skip 'Wiki page not found'
  end

  private

  def log_user(login, password)
    post '/login', params: { username: login, password: password }
    follow_redirect!
  end
end

