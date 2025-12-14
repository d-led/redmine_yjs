namespace :redmine_yjs do
  desc "Build Yjs dependencies bundle"
  task :build_assets do
    require 'fileutils'
    
    plugin_root = File.expand_path('../../../../', __FILE__)
    assets_dir = File.join(plugin_root, 'assets', 'javascripts')
    bundle_file = File.join(assets_dir, 'yjs-deps.bundle.js')
    
    puts "[RedmineYjs] Building assets..."
    
    # Check if Node.js is available
    unless system('which node > /dev/null 2>&1')
      puts "[RedmineYjs] Warning: Node.js not found. Skipping asset build."
      puts "[RedmineYjs] Assets should be pre-built and committed to the repository."
      next
    end
    
    # Check if package.json exists
    package_json = File.join(plugin_root, 'package.json')
    unless File.exist?(package_json)
      puts "[RedmineYjs] Warning: package.json not found. Skipping asset build."
      next
    end
    
    # Change to plugin directory
    Dir.chdir(plugin_root) do
      # Install dependencies if node_modules doesn't exist
      unless File.directory?('node_modules')
        puts "[RedmineYjs] Installing Node.js dependencies..."
        unless system('npm install')
          puts "[RedmineYjs] Error: Failed to install Node.js dependencies"
          exit 1
        end
      end
      
      # Build dependencies
      puts "[RedmineYjs] Building Yjs dependencies bundle..."
      unless system('npm run build:deps')
        puts "[RedmineYjs] Error: Failed to build assets"
        exit 1
      end
      
      puts "[RedmineYjs] ✓ Assets built successfully"
      puts "[RedmineYjs] Output: #{bundle_file}"
      
      if File.exist?(bundle_file)
        size = File.size(bundle_file)
        puts "[RedmineYjs] Size: #{(size / 1024.0).round(2)} KB"
      end
    end
  end
  
  desc "Copy plugin assets to public directory"
  task :copy_assets do
    require_relative '../../lib/redmine_yjs'
    RedmineYjs.copy_assets_to_public
    puts "[RedmineYjs] ✓ Assets copied to public/plugin_assets/redmine_yjs"
  end
  
  desc "Build assets and copy to public (full setup)"
  task :setup => [:build_assets, :copy_assets] do
    puts "[RedmineYjs] ✓ Setup complete"
  end
end

# Make build_assets available as a dependency for other tasks
task 'redmine:plugins:assets' => 'redmine_yjs:build_assets' if Rake::Task.task_defined?('redmine:plugins:assets')

