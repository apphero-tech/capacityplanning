/**
 * Minimal shapes for the raw Jira Agile-API issue objects we consume.
 * Only the fields the toolkit actually reads are typed; everything else is
 * left open so we never fight Jira's full schema.
 */

export interface JiraStatusCategory {
  key?: string;
}

export interface JiraStatus {
  id?: string | number;
  name?: string;
  statusCategory?: JiraStatusCategory;
}

export interface JiraIssueType {
  name?: string;
}

export interface JiraChangelogItem {
  field?: string;
  fieldId?: string;
  from?: string | number | null;
  to?: string | number | null;
  fromString?: string;
  toString?: string;
}

export interface JiraChangelogHistory {
  created: string;
  items?: JiraChangelogItem[];
}

export interface JiraIssueLinkType {
  inward?: string;
  outward?: string;
}

export interface JiraLinkedIssue {
  key?: string;
  fields?: {
    summary?: string;
    status?: JiraStatus;
  };
}

export interface JiraIssueLink {
  type?: JiraIssueLinkType;
  inwardIssue?: JiraLinkedIssue;
  outwardIssue?: JiraLinkedIssue;
}

export interface JiraUser {
  accountId?: string;
  displayName?: string;
}

export interface JiraIssueFields {
  summary?: string;
  status?: JiraStatus;
  created?: string;
  issuetype?: JiraIssueType;
  issuelinks?: JiraIssueLink[];
  assignee?: JiraUser | null;
  // custom fields (Blocked, Story Points) accessed by id string
  [customField: string]: unknown;
}

export interface JiraIssue {
  key?: string;
  fields?: JiraIssueFields;
  changelog?: { histories?: JiraChangelogHistory[] };
}

/** Agile-API paginated page of issues. */
export interface JiraIssuePage {
  issues?: JiraIssue[];
  startAt?: number;
  maxResults?: number;
  total?: number;
}
