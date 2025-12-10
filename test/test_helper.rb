# frozen_string_literal: true

# Redmine Yjs Plugin - Test Helper
# Load the Redmine test helper
require File.expand_path('../../../test/test_helper', __dir__)

# Plugin test helper module
module RedmineYjsTestHelper
  # Helper methods for Yjs plugin tests can be added here
end

# Include helper in test cases
class ActiveSupport::TestCase
  include RedmineYjsTestHelper
end

