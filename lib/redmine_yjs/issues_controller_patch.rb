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
          # In collaborative mode, we don't call out conflicts - just update lock_version and proceed
          if yjs_enabled? && @issue && params[:issue]
            # Check if lock_version is present (indicates optimistic locking is active)
            if params[:issue][:lock_version]
              # Determine which field was being edited
              field = params[:issue].key?(:description) ? :description : :notes
              
              # Store old lock_version before reload
              old_lock_version = @issue.lock_version
              
              # Reload to get latest lock_version from database
              # This updates @issue.lock_version automatically
              @issue.reload
              
              # Update params lock_version to match current database value
              # This bypasses Redmine's conflict detection since lock_versions will match
              # Yjs CRDTs already handle merging in real-time, so we don't need to redirect
              current_lock_version = @issue.lock_version
              params[:issue][:lock_version] = current_lock_version
              
              # Also ensure @issue object has the updated lock_version attribute
              # Redmine may check @issue.lock_version directly, so we need to ensure it matches
              @issue.lock_version = current_lock_version
            end
          end
          
          # Call original update method
          update_without_yjs
        rescue ActiveRecord::StaleObjectError => e
          if yjs_enabled?
            # Fallback: if stale error still occurs, reload and retry without redirecting
            if @issue && params[:issue]
              # Determine which field was being edited
              field = params[:issue].key?(:description) ? :description : :notes
              
              # Reload to get latest lock_version from database
              @issue.reload
              
              # Update params lock_version to match current database value
              # This bypasses conflict detection - Yjs already handled merging
              params[:issue][:lock_version] = @issue.lock_version
              
              # Retry the update without redirecting
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

