module RedmineYjs
  class Hooks < Redmine::Hook::ViewListener
    # Include Yjs assets in the layout
    def view_layouts_base_html_head(context = {})
      Rails.logger.info "[Yjs Hook] view_layouts_base_html_head called"
      
      # Get the view context
      view = context[:view] || context[:hook_caller]
      
      if view.nil?
        Rails.logger.error "[Yjs Hook] No view context available"
        return ''
      end
      
      # Build result string directly - don't use content_for in hook
      result = []
      
      # Always add a test script first to verify hook is working
      result << view.javascript_tag("console.log('[Yjs] Hook fired!');").html_safe
      
      # Check if enabled - try helper first, fallback to direct settings check
      # According to Redmine plugin tutorial, hooks can access view context
      # but helpers may not always be available, so we check settings directly
      enabled_value = false
      settings = Setting.plugin_redmine_yjs rescue nil
      
      if view.respond_to?(:yjs_enabled?)
        enabled_value = view.yjs_enabled?
        Rails.logger.info "[Yjs Hook] Using helper method, enabled: #{enabled_value}"
      elsif settings
        # Fallback: check settings directly (helper might not be available in hook context)
        enabled_value = settings['yjs_enabled'] == '1'
        Rails.logger.info "[Yjs Hook] Helper not available, checking settings directly: #{settings.inspect}, enabled: #{enabled_value}"
      else
        Rails.logger.warn "[Yjs Hook] No settings found, plugin disabled"
      end
      
      if enabled_value
        Rails.logger.info "[Yjs Hook] Yjs enabled, rendering assets"
            # Get URL - try helper first, fallback to settings
            hocuspocus_url = if view.respond_to?(:hocuspocus_url)
              view.hocuspocus_url
            else
          settings = Setting.plugin_redmine_yjs rescue nil
          url = settings && settings['hocuspocus_url'] || 'ws://localhost:3000/ws'
              # Convert internal Docker hostname to browser-accessible URL
              if url.include?('hocuspocus:')
                url = url.gsub('hocuspocus:', 'localhost:')
              end
              # Remove trailing slash
              url = url.gsub(/\/+$/, '')
              url
            end
            Rails.logger.info "[Yjs Hook] Hocuspocus URL: #{hocuspocus_url}"
        
        # Render assets directly inline
        result << view.javascript_tag("console.log('[Yjs] Plugin enabled');").html_safe
        
        # Use Redmine's plugin asset system - :plugin option tells Redmine to look in plugin's assets directory
        # For Redmine 6.x, assets should be in app/assets/ and will be served via plugin_assets
        result << view.stylesheet_link_tag('yjs-collaboration', plugin: 'redmine_yjs').html_safe
        
        # Configuration script - must load BEFORE dependencies so config is available
        user_info = if User.current.logged?
          { id: User.current.id.to_s, name: User.current.name }
        else
          { id: 'anonymous', name: 'Anonymous' }
        end
        
        # Extract document context from view/controller
        # Redmine hooks provide controller via context[:controller]
        document_context = {}
        controller = context[:controller]
        
        # Get project ID
        project_id = if controller && controller.instance_variable_get(:@project)
          controller.instance_variable_get(:@project).id rescue nil
        end
        
        # Get issue ID
        issue_id = if controller && controller.instance_variable_get(:@issue)
          controller.instance_variable_get(:@issue).id rescue nil
        end
        
        # Get wiki page info
        wiki_page = nil
        if controller && controller.instance_variable_get(:@page)
          page = controller.instance_variable_get(:@page)
          wiki_page = {
            id: (page.id rescue nil),
            title: (page.title rescue nil)
          }
        end
        
        # Build document context
        document_context[:project_id] = project_id if project_id
        document_context[:issue_id] = issue_id if issue_id
        if wiki_page && (wiki_page[:id] || wiki_page[:title])
          document_context[:wiki_page_id] = wiki_page[:id] if wiki_page[:id]
          document_context[:wiki_page_title] = wiki_page[:title] if wiki_page[:title]
        end
        
        # Log document context for debugging
        if document_context.any?
          Rails.logger.info "[Yjs Hook] Document context: #{document_context.inspect}"
        else
          Rails.logger.debug "[Yjs Hook] No document context found (controller: #{controller.class.name rescue 'unknown'})"
        end
        
        # Properly embed JSON for JavaScript
        # Convert Ruby hash to JavaScript object literal directly (safer than JSON.parse)
        document_context_js = document_context.map { |k, v| 
          "#{k.to_s}: #{v.is_a?(String) ? v.to_json : v}" 
        }.join(', ')
        
        config_script = <<-JS
          console.log('[Yjs] Configuration script loaded');
          try {
            window.RedmineYjsConfig = {
              hocuspocusUrl: #{hocuspocus_url.to_json},
              enabled: true,
              documentContext: {#{document_context_js}}
            };
            window.currentUser = {
              id: #{user_info[:id].to_json},
              name: #{user_info[:name].to_json}
            };
            console.log('[Yjs] Config set:', window.RedmineYjsConfig);
            console.log('[Yjs] User:', window.currentUser);
            console.log('[Yjs] Document context:', window.RedmineYjsConfig.documentContext);
          } catch (e) {
            console.error('[Yjs] Error setting config:', e);
          }
        JS
        result << view.javascript_tag(config_script).html_safe
        
        # Load dependencies: prefer bundled version, fallback to CDN
        # Check if bundled dependencies exist (built with esbuild)
        bundled_deps_path = File.join(Rails.root, 'public', 'plugin_assets', 'redmine_yjs', 'javascripts', 'yjs-deps.bundle.js')
        if File.exist?(bundled_deps_path)
          Rails.logger.info "[Yjs Hook] Using bundled dependencies"
          assets_root = RedmineYjs.assets_root
          # Load bundled deps synchronously - must load before our script
          result << view.javascript_include_tag("#{assets_root}/javascripts/yjs-deps.bundle.js", defer: false).html_safe
        else
          Rails.logger.info "[Yjs Hook] Using CDN dependencies (bundled version not found)"
          # Use esm.sh CDN which provides UMD builds - load synchronously (no defer)
          # esm.sh converts ES modules to UMD format with specified global names
          # These must load BEFORE our script runs
          result << '<script src="https://esm.sh/yjs@13.6.27?bundle&format=umd&global=Y"></script>'.html_safe
          result << '<script src="https://esm.sh/@hocuspocus/provider@2.10.0?bundle&format=umd&global=HocuspocusProvider&deps=yjs@13.6.27"></script>'.html_safe
        end
        
        # Use plugin: option for our own script - Redmine will serve it from plugin_assets
        # Load synchronously (no defer) - runs after dependencies are loaded
        result << view.javascript_include_tag('yjs-collaboration', plugin: 'redmine_yjs', defer: false).html_safe
      else
        Rails.logger.info "[Yjs Hook] Yjs disabled"
        result << view.javascript_tag("console.log('[Yjs] Plugin disabled');").html_safe
      end
      
      result.join("\n").html_safe
    end

    # Inject collaboration status widget into wiki edit form
    def view_wiki_form_bottom(context = {})
      view = context[:view] || context[:hook_caller]
      return '' unless view
      
      settings = Setting.plugin_redmine_yjs rescue nil
      enabled_value = if view.respond_to?(:yjs_enabled?)
        view.yjs_enabled?
      elsif settings
        settings['yjs_enabled'] == '1'
      else
        false
      end
      
      return '' unless enabled_value
      
      # Inject a status div that will be populated by JavaScript
      view.content_tag(:div, '', id: 'yjs-collaboration-status', class: 'yjs-collaboration-status-widget').html_safe
    end
  end
end
