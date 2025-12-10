module RedmineYjs
  def self.root
    @root ||= Pathname.new(File.expand_path('../../', __FILE__))
  end

  def self.assets_root
    @assets_root ||= "#{Redmine::Utils.relative_url_root}/plugin_assets/redmine_yjs"
  end

  # Assets are copied during Docker build (see redmine/Dockerfile)
  # This method is kept for potential manual copying if needed
  def self.copy_assets_to_public
    return if Redmine::VERSION::MAJOR < 6

    plugin_assets_dir = File.join(Rails.root, 'public', 'plugin_assets', 'redmine_yjs')
    
    unless File.exist?(plugin_assets_dir)
      FileUtils.mkdir_p(plugin_assets_dir)
    end

    # Copy assets from assets/ directory (Redmine convention)
    assets_source = File.join(root, 'assets')
    if File.exist?(assets_source)
      FileUtils.cp_r(Dir.glob(File.join(assets_source, '*')), plugin_assets_dir)
      Rails.logger.info "[Yjs] Copied assets to #{plugin_assets_dir}"
    end
  end
end




