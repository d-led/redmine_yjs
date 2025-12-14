module RedmineYjs
  module IssuesControllerPatch
    def self.included(base)
      base.class_eval do
        # Override update action to bypass stale object check when Yjs is enabled
        # Yjs CRDTs handle conflict resolution, so we don't need optimistic locking
        alias_method :update_without_yjs, :update unless method_defined?(:update_without_yjs)
        
        def update
          # Call original update method
          update_without_yjs
        rescue ActiveRecord::StaleObjectError => e
          if yjs_enabled?
            # With Yjs enabled, merge database changes with Yjs document
            # Reload to get the saved content from database
            if @issue && params[:issue]
              # Determine which field was being edited
              field = params[:issue].key?(:description) ? :description : :notes
              
              @issue.reload
              
              # Store saved content in flash to signal JavaScript to merge
              # JavaScript will merge and then auto-retry the save
              flash[:yjs_merge_content] = @issue.send(field)
              flash[:yjs_merge_document] = yjs_document_name(field)
              flash[:yjs_auto_retry] = true
              
              # Update lock_version to current
              params[:issue][:lock_version] = @issue.lock_version
              
              # Store form data for retry
              flash[:yjs_retry_params] = params.to_unsafe_h
              
              # Redirect back to edit page - JavaScript will merge and auto-retry
              redirect_to edit_issue_path(@issue),
                          notice: l(:notice_merging_changes)
            else
              raise e
            end
          else
            raise e
          end
        end
        
        private
        
        def yjs_enabled?
          settings = Setting.plugin_redmine_yjs rescue nil
          settings && settings['yjs_enabled'] == '1'
        end
        
        def yjs_document_name(field)
          return nil unless @issue && @issue.project
          field_name = field == :description ? 'description' : 'notes'
          "issue-#{@issue.id}-#{field_name}"
        end
      end
    end
  end
end

