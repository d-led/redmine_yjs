module RedmineYjs
  def self.root
    @root ||= Pathname.new(File.expand_path('../../', __FILE__))
  end

  def self.assets_root
    @assets_root ||= "#{Redmine::Utils.relative_url_root}/plugin_assets/redmine_yjs"
  end

  # Automatically copy assets from plugin's assets/ directory to public/plugin_assets
  # This is called on plugin initialization to ensure assets are available
  # Will attempt to build assets if they're missing
  def self.copy_assets_to_public
    return if Redmine::VERSION::MAJOR < 6

    plugin_assets_dir = File.join(Rails.root, 'public', 'plugin_assets', 'redmine_yjs')
    assets_source = File.join(root, 'assets')
    
    return unless File.exist?(assets_source)

    # Check if critical assets exist, attempt to build if missing
    bundle_file = File.join(assets_source, 'javascripts', 'yjs-deps.bundle.js')
    unless File.exist?(bundle_file)
      Rails.logger.warn "[Yjs] Bundle file not found, attempting to build assets..."
      build_assets_if_possible
    end

    # Create target directory if it doesn't exist
    FileUtils.mkdir_p(plugin_assets_dir) unless File.exist?(plugin_assets_dir)

    # Copy assets, preserving directory structure
    # Only copy if source is newer or target doesn't exist (idempotent)
    Dir.glob(File.join(assets_source, '**', '*')).each do |source_file|
      next if File.directory?(source_file)
      
      relative_path = source_file.sub(assets_source + '/', '')
      target_file = File.join(plugin_assets_dir, relative_path)
      target_dir = File.dirname(target_file)
      
      FileUtils.mkdir_p(target_dir) unless File.exist?(target_dir)
      
      # Only copy if source is newer or target doesn't exist
      if !File.exist?(target_file) || File.mtime(source_file) > File.mtime(target_file)
        FileUtils.cp(source_file, target_file, preserve: true)
      end
    end
    
    Rails.logger.info "[Yjs] Assets available at #{plugin_assets_dir}"
  end

  # Attempt to build assets if Node.js is available
  # This is a fallback for development environments
  def self.build_assets_if_possible
    return unless system('which node > /dev/null 2>&1')
    
    package_json = File.join(root, 'package.json')
    return unless File.exist?(package_json)
    
    Rails.logger.info "[Yjs] Building assets with Node.js..."
    
    Dir.chdir(root) do
      # Install dependencies if needed
      unless File.directory?('node_modules')
        Rails.logger.info "[Yjs] Installing Node.js dependencies..."
        system('npm install') || return
      end
      
      # Build assets
      if system('npm run build:deps')
        Rails.logger.info "[Yjs] Assets built successfully"
      else
        Rails.logger.warn "[Yjs] Failed to build assets (this is OK if assets are pre-built)"
      end
    end
  rescue => e
    Rails.logger.warn "[Yjs] Could not build assets: #{e.message}"
    Rails.logger.info "[Yjs] Using CDN fallback for dependencies"
  end
end




