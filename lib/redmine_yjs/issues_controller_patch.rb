module RedmineYjs
  module IssuesControllerPatch
    def self.included(base)
      base.class_eval do
        # Override update action to bypass stale object check when Yjs is enabled
        # Yjs CRDTs handle conflict resolution, so we don't need optimistic locking
        alias_method :update_without_yjs, :update unless method_defined?(:update_without_yjs)
        
        def update
          # When Yjs is enabled, always reload and update lock_version before save
          # This prevents stale object errors since Yjs CRDTs handle merging
          if yjs_enabled? && @issue && params[:issue]
            # Check if lock_version is present (indicates optimistic locking is active)
            if params[:issue][:lock_version]
              # Determine which field was being edited
              field = params[:issue].key?(:description) ? :description : :notes
              
              # Reload to get latest lock_version and content from database
              old_lock_version = @issue.lock_version
              old_content = @issue.send(field)
              @issue.reload
              
              # Only redirect for merge if lock_version changed (actual conflict)
              # Don't redirect just for content differences - let the save proceed normally
              if old_lock_version != @issue.lock_version && old_content != @issue.send(field)
                # Store saved content in flash to signal JavaScript to merge
                flash[:yjs_merge_content] = @issue.send(field)
                flash[:yjs_merge_document] = yjs_document_name(field)
                flash[:yjs_auto_retry] = true
                
                # Update lock_version to current
                params[:issue][:lock_version] = @issue.lock_version
                
                # Redirect back to edit page - JavaScript will merge and auto-retry
                redirect_to edit_issue_path(@issue),
                            notice: l(:notice_merging_changes)
                return
              end
              
              # No conflict or content didn't change, just update lock_version to bypass stale check
              params[:issue][:lock_version] = @issue.lock_version
            end
          end
          
          # Call original update method
          update_without_yjs
        rescue ActiveRecord::StaleObjectError => e
          if yjs_enabled?
            # Fallback: if stale error still occurs (shouldn't happen with above logic)
            if @issue && params[:issue]
              # Determine which field was being edited
              field = params[:issue].key?(:description) ? :description : :notes
              
              @issue.reload
              
              # Store saved content in flash to signal JavaScript to merge
              flash[:yjs_merge_content] = @issue.send(field)
              flash[:yjs_merge_document] = yjs_document_name(field)
              flash[:yjs_auto_retry] = true
              
              # Update lock_version to current
              params[:issue][:lock_version] = @issue.lock_version
              
              # Retry the update
              update_without_yjs
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

