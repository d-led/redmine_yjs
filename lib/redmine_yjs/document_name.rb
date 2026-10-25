module RedmineYjs
  # The single source of truth for Yjs document names.
  #
  # The same name is used to
  #   * sign the Hocuspocus token (lib/redmine_yjs/application_helper_patch.rb),
  #   * tell the browser which document to open (lib/redmine_yjs/hooks.rb),
  #   * label content that has to be merged after a conflicting save
  #     (lib/redmine_yjs/*_controller_patch.rb).
  #
  # Keeping one implementation is what makes token verification possible: the
  # Hocuspocus server rejects a token whose `doc` claim differs from the
  # document the client opens.
  module DocumentName
    WIKI_CONTENT_FIELD = 'content_text'.freeze
    UNKNOWN_PROJECT = '0'.freeze

    module_function

    # @param context [Hash] symbols or strings accepted; keys may be
    #   :issue_id, :wiki_page_id, :wiki_page_title, :project_id
    # @return [String, nil] nil when the context describes no collaborative document
    def for(context)
      context = normalize(context)

      return issue(context) if context[:issue_id]
      return wiki(context) if context[:wiki_page_id] || context[:wiki_page_title]
      return project(context) if context[:project_id]

      nil
    end

    def issue(context)
      "issue-#{context[:issue_id]}"
    end

    def wiki(context)
      page = context[:wiki_page_id] || context[:wiki_page_title]

      "wiki-#{context[:project_id] || UNKNOWN_PROJECT}-#{sanitize(page)}-#{WIKI_CONTENT_FIELD}"
    end

    def project(context)
      "project-#{context[:project_id]}"
    end

    def sanitize(identifier)
      identifier.to_s.gsub(/[^a-zA-Z0-9_-]/, '-').downcase
    end

    def normalize(context)
      (context || {}).each_with_object({}) do |(key, value), normalized|
        normalized[key.to_sym] = value unless value.to_s.strip.empty?
      end
    end
  end
end
