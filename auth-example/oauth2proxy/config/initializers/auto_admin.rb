# Auto-promote users to admin based on email list
# This runs after users are created via redmine_proxyauth plugin
Rails.application.config.to_prepare do
  if defined?(User)
    # Log configured admin emails on startup
    admin_emails = ENV['REDMINE_ADMIN_EMAILS'].to_s.split(',').map(&:strip).reject(&:empty?)
    if admin_emails.any?
      Rails.logger.info "[Auto Admin] Configured admin emails: #{admin_emails.join(', ')}"
    else
      Rails.logger.info "[Auto Admin] No admin emails configured (REDMINE_ADMIN_EMAILS not set or empty)"
    end
    
    # Hook into user creation/update to auto-promote admins
    User.class_eval do
      # Trigger on both new user creation and email changes
      after_create :auto_promote_to_admin_on_create
      after_save :auto_promote_to_admin_on_email_change, if: -> { respond_to?(:saved_change_to_mail?) && saved_change_to_mail? }
      
      private
      
      def auto_promote_to_admin_on_create
        auto_promote_to_admin
      end
      
      def auto_promote_to_admin_on_email_change
        auto_promote_to_admin
      end
      
      def auto_promote_to_admin
        # Skip if this is not a real User instance (e.g., AnonymousUser)
        return unless respond_to?(:mail) && respond_to?(:admin?)
        return unless persisted?
        
        admin_emails = ENV['REDMINE_ADMIN_EMAILS'].to_s.split(',').map(&:strip).reject(&:empty?)
        return if admin_emails.empty?
        return if admin? # Already admin, skip
        
        if mail.present? && admin_emails.include?(mail)
          # Use update_columns to avoid triggering callbacks again
          update_columns(admin: true, status: User::STATUS_ACTIVE)
          Rails.logger.info "[Auto Admin] Promoted user #{mail} to admin"
        end
      end
    end
  end
end

