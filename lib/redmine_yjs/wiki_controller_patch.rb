module RedmineYjs
  module WikiControllerPatch
    def self.included(base)
      base.class_eval do
        # Override update action to bypass stale object check when Yjs is enabled
        # Yjs CRDTs handle conflict resolution, so we don't need optimistic locking
        alias_method :update_without_yjs, :update unless method_defined?(:update_without_yjs)
        
        def update
          # When Yjs is enabled, always reload and update lock_version before save
          # This prevents stale object errors since Yjs CRDTs handle merging
          if yjs_enabled? && @content && params[:content]
            # Check if lock_version is present (indicates optimistic locking is active)
            if params[:content][:lock_version]
              # Reload to get latest lock_version and content from database
              old_lock_version = @content.lock_version
              old_text = @content.text
              @content.reload
              
              # Only redirect for merge if lock_version changed (actual conflict)
              # Don't redirect just for content differences - let the save proceed normally
              if old_lock_version != @content.lock_version && old_text != @content.text
                # Store saved content in flash to signal JavaScript to merge
                flash[:yjs_merge_content] = @content.text
                flash[:yjs_merge_document] = yjs_document_name
                flash[:yjs_auto_retry] = true
                
                # Update lock_version to current
                params[:content][:lock_version] = @content.lock_version
                
                # Redirect back to edit page - JavaScript will merge and auto-retry
                redirect_to edit_project_wiki_page_path(@page.project, @page.title),
                            notice: l(:notice_merging_changes)
                return
              end
              
              # No conflict or content didn't change, just update lock_version to bypass stale check
              params[:content][:lock_version] = @content.lock_version
            end
          end
          
          # Call original update method
          update_without_yjs
        rescue ActiveRecord::StaleObjectError => e
          if yjs_enabled?
            # Fallback: if stale error still occurs, redirect to merge and retry
            if @content && params[:content]
              @content.reload
              
              # Store saved content in flash to signal JavaScript to merge
              flash[:yjs_merge_content] = @content.text
              flash[:yjs_merge_document] = yjs_document_name
              flash[:yjs_auto_retry] = true
              
              # Update lock_version to current
              params[:content][:lock_version] = @content.lock_version
              
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

