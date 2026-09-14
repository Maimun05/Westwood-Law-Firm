export type Json =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]: Json | undefined;
    }
  | Json[];

type TablesWithRelationships<T> = {
  [K in keyof T]: T[K] extends { Relationships: unknown[] } ? T[K] : T[K] & { Relationships: [] };
};

export interface Database {
  public: {
    Tables: TablesWithRelationships<{
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          phone: string | null;
          address: string | null;
          city: string | null;
          date_of_birth: string | null;
          role: "client" | "lawyer" | "admin";
          is_active: boolean;
          preferred_contact_method: string | null;
          last_active_at: string | null;
          position: string | null;
          bio: string | null;
          education: Json;
          bar_admissions: Json;
          experience_years: number | null;
          profile_image: string | null;
          linkedin_url: string | null;
          display_order: number;
          honorific: string | null;
          first_name: string | null;
          middle_name: string | null;
          last_name: string | null;
          suffix: string | null;
          nickname: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          phone?: string | null;
          address?: string | null;
          city?: string | null;
          date_of_birth?: string | null;
          role?: "client" | "lawyer" | "admin";
          is_active?: boolean;
          preferred_contact_method?: string | null;
          last_active_at?: string | null;
          position?: string | null;
          bio?: string | null;
          education?: Json;
          bar_admissions?: Json;
          experience_years?: number | null;
          profile_image?: string | null;
          linkedin_url?: string | null;
          display_order?: number;
          honorific?: string | null;
          first_name?: string | null;
          middle_name?: string | null;
          last_name?: string | null;
          suffix?: string | null;
          nickname?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          phone?: string | null;
          address?: string | null;
          city?: string | null;
          date_of_birth?: string | null;
          role?: "client" | "lawyer" | "admin";
          is_active?: boolean;
          preferred_contact_method?: string | null;
          last_active_at?: string | null;
          position?: string | null;
          bio?: string | null;
          education?: Json;
          bar_admissions?: Json;
          experience_years?: number | null;
          profile_image?: string | null;
          linkedin_url?: string | null;
          display_order?: number;
          honorific?: string | null;
          first_name?: string | null;
          middle_name?: string | null;
          last_name?: string | null;
          suffix?: string | null;
          nickname?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      matters: {
        Row: {
          id: string;
          matter_number: string;
          client_id: string;
          lawyer_id: string | null;
          practice_area: string;
          status:
            | "New Inquiry"
            | "Under Review"
            | "Consultation"
            | "Conflict Check"
            | "Accepted"
            | "Active"
            | "Resolved"
            | "Closed";
          priority: "Low" | "Medium" | "High";
          title: string;
          description: string;
          date_opened: string;
          date_closed: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          matter_number: string;
          client_id: string;
          lawyer_id?: string | null;
          practice_area: string;
          status?:
            | "New Inquiry"
            | "Under Review"
            | "Consultation"
            | "Conflict Check"
            | "Accepted"
            | "Active"
            | "Resolved"
            | "Closed";
          priority?: "Low" | "Medium" | "High";
          title: string;
          description: string;
          date_opened?: string;
          date_closed?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          matter_number?: string;
          client_id?: string;
          lawyer_id?: string | null;
          practice_area?: string;
          status?:
            | "New Inquiry"
            | "Under Review"
            | "Consultation"
            | "Conflict Check"
            | "Accepted"
            | "Active"
            | "Resolved"
            | "Closed";
          priority?: "Low" | "Medium" | "High";
          title?: string;
          description?: string;
          date_opened?: string;
          date_closed?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      inquiries: {
        Row: {
          id: string;
          inquiry_number: string;
          name: string;
          email: string;
          phone: string | null;
          practice_area: string;
          preferred_lawyer: string | null;
          subject: string;
          message: string;
          status: "New" | "Under Review" | "Contacted" | "Converted" | "Closed";
          assigned_to: string | null;
          client_id: string | null;
          preferred_contact_method: string | null;
          firm_notified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          inquiry_number?: string;
          name: string;
          email: string;
          phone?: string | null;
          practice_area: string;
          preferred_lawyer?: string | null;
          subject: string;
          message: string;
          status?: "New" | "Under Review" | "Contacted" | "Converted" | "Closed";
          assigned_to?: string | null;
          client_id?: string | null;
          preferred_contact_method?: string | null;
          firm_notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          inquiry_number?: string;
          name?: string;
          email?: string;
          phone?: string | null;
          practice_area?: string;
          preferred_lawyer?: string | null;
          subject?: string;
          message?: string;
          status?: "New" | "Under Review" | "Contacted" | "Converted" | "Closed";
          assigned_to?: string | null;
          client_id?: string | null;
          preferred_contact_method?: string | null;
          firm_notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      inquiry_attachments: {
        Row: {
          id: string;
          inquiry_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          size_bytes: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          inquiry_id: string;
          storage_path: string;
          file_name: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          inquiry_id?: string;
          storage_path?: string;
          file_name?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          created_at?: string;
        };
      };
      documents: {
        Row: {
          id: string;
          matter_id: string;
          name: string;
          file_path: string;
          file_type: string;
          file_size: number;
          version: string;
          status: "Draft" | "Received" | "Final" | "Archived";
          access_level:
            | "Public"
            | "Staff Shared"
            | "Confidential"
            | "Lawyer Only"
            | "Client & Assigned Lawyer";
          uploaded_by: string;
          uploaded_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          matter_id: string;
          name: string;
          file_path: string;
          file_type: string;
          file_size: number;
          version?: string;
          status?: "Draft" | "Received" | "Final" | "Archived";
          access_level?:
            | "Public"
            | "Staff Shared"
            | "Confidential"
            | "Lawyer Only"
            | "Client & Assigned Lawyer";
          uploaded_by: string;
          uploaded_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          matter_id?: string;
          name?: string;
          file_path?: string;
          file_type?: string;
          file_size?: number;
          version?: string;
          status?: "Draft" | "Received" | "Final" | "Archived";
          access_level?:
            | "Public"
            | "Staff Shared"
            | "Confidential"
            | "Lawyer Only"
            | "Client & Assigned Lawyer";
          uploaded_by?: string;
          uploaded_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      appointments: {
        Row: {
          id: string;
          matter_id: string;
          client_id: string;
          lawyer_id: string;
          appointment_type: string;
          date: string;
          time: string;
          mode: "In-Person" | "Video Call" | "Phone Call";
          status: "Pending" | "Confirmed" | "Completed" | "Cancelled";
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          matter_id: string;
          client_id: string;
          lawyer_id: string;
          appointment_type: string;
          date: string;
          time: string;
          mode?: "In-Person" | "Video Call" | "Phone Call";
          status?: "Pending" | "Confirmed" | "Completed" | "Cancelled";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          matter_id?: string;
          client_id?: string;
          lawyer_id?: string;
          appointment_type?: string;
          date?: string;
          time?: string;
          mode?: "In-Person" | "Video Call" | "Phone Call";
          status?: "Pending" | "Confirmed" | "Completed" | "Cancelled";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          user_email: string | null;
          user_role: string | null;
          event_type: string;
          event_description: string;
          resource_type: string | null;
          resource_id: string | null;
          metadata: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          success: boolean;
          created_at: string;
          source: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          user_email?: string | null;
          user_role?: string | null;
          event_type: string;
          event_description: string;
          resource_type?: string | null;
          resource_id?: string | null;
          metadata?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          success?: boolean;
          created_at?: string;
          source?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          user_email?: string | null;
          user_role?: string | null;
          event_type?: string;
          event_description?: string;
          resource_type?: string | null;
          resource_id?: string | null;
          metadata?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          success?: boolean;
          created_at?: string;
          source?: string;
        };
      };
      practice_areas: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string;
          icon: string;
          color: string;
          is_active: boolean;
          display_order: number;
          services: string[];
          client_needs: string[];
          related_matters: string[];
          lawyer_ids: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          slug: string;
          description: string;
          icon: string;
          color: string;
          is_active?: boolean;
          display_order?: number;
          services: string[];
          client_needs: string[];
          related_matters: string[];
          lawyer_ids: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string;
          icon?: string;
          color?: string;
          is_active?: boolean;
          display_order?: number;
          services?: string[];
          client_needs?: string[];
          related_matters?: string[];
          lawyer_ids?: string[];
          created_at?: string;
          updated_at?: string;
        };
      };
      articles: {
        Row: {
          id: string;
          title: string;
          slug: string;
          excerpt: string;
          content: string;
          author_id: string | null;
          category: string;
          cover_image: string | null;
          reading_time: string;
          is_published: boolean;
          published_at: string | null;
          view_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          title: string;
          slug: string;
          excerpt: string;
          content: string;
          author_id?: string | null;
          category: string;
          cover_image?: string | null;
          reading_time?: string;
          is_published?: boolean;
          published_at?: string | null;
          view_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          slug?: string;
          excerpt?: string;
          content?: string;
          author_id?: string | null;
          category?: string;
          cover_image?: string | null;
          reading_time?: string;
          is_published?: boolean;
          published_at?: string | null;
          view_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      specialists: {
        Row: {
          id: string;
          name: string;
          title: string;
          specialty: string;
          organization: string;
          email: string;
          phone: string | null;
          bio: string;
          image_url: string | null;
          is_active: boolean;
          display_order: number;
          specialist_type: string;
          services_supported: string[];
          connected_practice_areas: string[];
          industry: string;
          location: string;
          description: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          title: string;
          specialty: string;
          organization: string;
          email: string;
          phone?: string | null;
          bio: string;
          image_url?: string | null;
          is_active?: boolean;
          display_order?: number;
          specialist_type: string;
          services_supported: string[];
          connected_practice_areas: string[];
          industry: string;
          location: string;
          description: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          title?: string;
          specialty?: string;
          organization?: string;
          email?: string;
          phone?: string | null;
          bio?: string;
          image_url?: string | null;
          is_active?: boolean;
          display_order?: number;
          specialist_type?: string;
          services_supported?: string[];
          connected_practice_areas?: string[];
          industry?: string;
          location?: string;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      corporate_clients: {
        Row: {
          id: string;
          name: string;
          logo_url: string | null;
          is_active: boolean;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          logo_url?: string | null;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          logo_url?: string | null;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
        };
      };
      faqs: {
        Row: {
          id: string;
          question: string;
          answer: string;
          category: string;
          is_active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          question: string;
          answer: string;
          category: string;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          question?: string;
          answer?: string;
          category?: string;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      seminar_events: {
        Row: {
          id: string;
          title: string;
          description: string;
          date: string;
          location: string;
          speaker: string;
          capacity: number | null;
          registration_url: string | null;
          is_active: boolean;
          mode: "In-Person" | "Online";
          time: string;
          speaker_name: string;
          speaker_profile_id: string | null;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          title: string;
          description: string;
          date: string;
          location: string;
          speaker: string;
          capacity?: number | null;
          registration_url?: string | null;
          is_active?: boolean;
          mode?: "In-Person" | "Online";
          time: string;
          speaker_name: string;
          speaker_profile_id?: string | null;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string;
          date?: string;
          location?: string;
          speaker?: string;
          capacity?: number | null;
          registration_url?: string | null;
          is_active?: boolean;
          mode?: "In-Person" | "Online";
          time?: string;
          speaker_name?: string;
          speaker_profile_id?: string | null;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      retainer_packages: {
        Row: {
          id: string;
          name: string;
          tagline: string | null;
          description: string;
          price: string;
          features: string[];
          is_active: boolean;
          display_order: number;
          price_display: string;
          cta_text: string;
          is_highlighted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          tagline: string | null;
          description: string;
          price: string;
          features: string[];
          is_active?: boolean;
          display_order?: number;
          price_display: string;
          cta_text: string;
          is_highlighted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          tagline?: string | null;
          description?: string;
          price?: string;
          features?: string[];
          is_active?: boolean;
          display_order?: number;
          price_display?: string;
          cta_text?: string;
          is_highlighted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          message: string;
          type: string;
          read: boolean;
          link: string | null;
          created_at: string;
          read_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          message: string;
          type?: string;
          read?: boolean;
          link?: string | null;
          created_at?: string;
          read_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          message?: string;
          type?: string;
          read?: boolean;
          link?: string | null;
          created_at?: string;
          read_at?: string | null;
        };
      };
      profile_practice_areas: {
        Row: {
          profile_id: string;
          practice_area_id: string;
          created_at: string;
        };
        Insert: {
          profile_id: string;
          practice_area_id: string;
          created_at?: string;
        };
        Update: {
          profile_id?: string;
          practice_area_id?: string;
          created_at?: string;
        };
      };
      matter_members: {
        Row: {
          matter_id: string;
          lawyer_id: string;
          added_by: string | null;
          created_at: string;
        };
        Insert: {
          matter_id: string;
          lawyer_id: string;
          added_by?: string | null;
          created_at?: string;
        };
        Update: {
          matter_id?: string;
          lawyer_id?: string;
          added_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "matter_members_matter_id_fkey";
            columns: ["matter_id"];
            isOneToOne: false;
            referencedRelation: "matters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matter_members_lawyer_id_fkey";
            columns: ["lawyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      matter_notes: {
        Row: {
          id: string;
          matter_id: string;
          author_id: string;
          body: string;
          visibility: "internal" | "client";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          matter_id: string;
          author_id: string;
          body: string;
          visibility?: "internal" | "client";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          matter_id?: string;
          author_id?: string;
          body?: string;
          visibility?: "internal" | "client";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "matter_notes_matter_id_fkey";
            columns: ["matter_id"];
            isOneToOne: false;
            referencedRelation: "matters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matter_notes_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      matter_events: {
        Row: {
          id: string;
          matter_id: string;
          event_type: string;
          title: string;
          detail: string | null;
          actor_id: string | null;
          visible_to_client: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          matter_id: string;
          event_type: string;
          title: string;
          detail?: string | null;
          actor_id?: string | null;
          visible_to_client?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          matter_id?: string;
          event_type?: string;
          title?: string;
          detail?: string | null;
          actor_id?: string | null;
          visible_to_client?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "matter_events_matter_id_fkey";
            columns: ["matter_id"];
            isOneToOne: false;
            referencedRelation: "matters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matter_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      confidential_access_grants: {
        Row: {
          id: string;
          document_id: string;
          admin_id: string;
          reason: string;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          admin_id: string;
          reason: string;
          created_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          admin_id?: string;
          reason?: string;
          created_at?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "confidential_access_grants_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "confidential_access_grants_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    }>;
    Views: {
      public_lawyers: {
        Row: {
          id: string;
          email: string;
          honorific: string | null;
          first_name: string | null;
          nickname: string | null;
          middle_name: string | null;
          last_name: string | null;
          suffix: string | null;
          full_name: string;
          position: string | null;
          bio: string | null;
          education: Json;
          bar_admissions: Json;
          experience_years: number | null;
          profile_image: string | null;
          linkedin_url: string | null;
          display_order: number;
          city: string | null;
          practice_areas: Json;
        };
        Relationships: [];
      };
    };
    Functions: {
      attach_inquiry_files: {
        Args: {
          p_reference: string;
          p_files: {
            path: string;
            name: string;
            mime?: string | null;
            size?: string | number | null;
          }[];
        };
        Returns: number;
      };
      generate_matter_number: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      generate_inquiry_number: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      generate_consultation_number: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      break_glass_open_document: {
        Args: { p_document_id: string; p_reason: string };
        Returns: string;
      };
      convert_inquiry_to_matter: {
        Args: {
          p_inquiry_id: string;
          p_lawyer_id: string;
          p_title?: string | null;
          p_priority?: "Low" | "Medium" | "High";
        };
        Returns: string;
      };
      submit_inquiry: {
        Args: {
          p_name?: string | null;
          p_email?: string | null;
          p_phone?: string | null;
          p_practice_area?: string | null;
          p_method?: string | null;
          p_message?: string | null;
          p_subject?: string | null;
        };
        Returns: string;
      };
    };
    Enums: {
      user_role: "client" | "lawyer" | "admin";
      matter_status:
        | "New Inquiry"
        | "Under Review"
        | "Consultation"
        | "Conflict Check"
        | "Accepted"
        | "Active"
        | "Resolved"
        | "Closed";
      priority_level: "Low" | "Medium" | "High";
      inquiry_status: "New" | "Under Review" | "Contacted" | "Converted" | "Closed";
      appointment_mode: "In-Person" | "Video Call" | "Phone Call";
      appointment_status: "Pending" | "Confirmed" | "Completed" | "Cancelled";
      document_status: "Draft" | "Received" | "Final" | "Archived";
      access_level:
        | "Public"
        | "Staff Shared"
        | "Confidential"
        | "Lawyer Only"
        | "Client & Assigned Lawyer";
      audit_result: "Success" | "Failed" | "Access Denied";
    };
    CompositeTypes: { [_ in never]: never };
  };
}
