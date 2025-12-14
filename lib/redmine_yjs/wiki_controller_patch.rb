module RedmineYjs
  module WikiControllerPatch
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
            if @content && params[:content]
              @content.reload
              
              # Store saved content in flash to signal JavaScript to merge
              # JavaScript will merge and then auto-retry the save
              flash[:yjs_merge_content] = @content.text
              flash[:yjs_merge_document] = yjs_document_name
              flash[:yjs_auto_retry] = true
              
              # Update lock_version to current
              params[:content][:lock_version] = @content.lock_version
              
              # Store form data for retry
              flash[:yjs_retry_params] = params.to_unsafe_h
              
              # Redirect back to edit page - JavaScript will merge and auto-retry
              redirect_to edit_project_wiki_page_path(@page.project, @page.title),
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
        
        def yjs_document_name
          return nil unless @page && @page.project
          "wiki-#{@page.project.id}-#{@page.id}-content_text"
        end
      end
    end
  end
end

