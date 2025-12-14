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
            # With Yjs enabled, reload the object to get latest lock_version and retry
            # Yjs CRDTs handle content merging, so we just need to sync the lock_version
            if @issue && params[:issue]
              @issue.reload
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
      end
    end
  end
end

