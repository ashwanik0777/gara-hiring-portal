export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  type: "application" | "interview" | "evaluation" | "leave" | "security" | "system";
  link: string;
  createdAt: string;
  read: boolean;
}
