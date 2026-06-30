import React, { useState } from 'react';

type TutorialKey = 'automate' | 'skills' | 'relay';

interface Tutorial {
  title: string;
  render: () => React.ReactNode;
}

export function Tutorials() {
  const [activeTutorial, setActiveTutorial] = useState<TutorialKey>('automate');

  const tutorials: Record<TutorialKey, Tutorial> = {
    automate: {
      title: 'Automating Web Search',
      render: () => (
        <article className="docs-article">
          <h2>Tutorial: Automating Event Discovery</h2>
          <p>
            This tutorial demonstrates how BrowseCortex chains multiple tools under a single instruction. You'll learn what happens under the hood when you give the agent a command like: 
            <em>"Find tech meetups in San Francisco this weekend and write them to sf-meetups.txt"</em>.
          </p>

          <h3>Step 1: Goal Decomposition</h3>
          <p>
            The agent parses the prompt, identifies it has a <strong>VFS filesystem</strong> and <strong>browser control tools</strong>, and breaks down the task into discrete, logical steps:
          </p>
          <ul>
            <li>Navigate to a search engine.</li>
            <li>Input the query and submit.</li>
            <li>Inspect and click relevant results.</li>
            <li>Scrape text content from pages.</li>
            <li>Format findings and write to a workspace text file.</li>
          </ul>

          <h3>Step 2: Execution and Page Annotation</h3>
          <p>
            To click a result on Google Search, the agent first runs <code>annotate_page()</code>. 
            This injects a temporary overlay numbering every link:
          </p>
          <div className="code-block-wrapper">
            <div className="code-block-header">
              <span>Agent Observation</span>
            </div>
            <pre>
[1] Google Search Input Field
[2] Search Button
[3] SF Tech Events - Meetup.com Link
[4] Developer Coffee Socials Link
            </pre>
          </div>
          <p>
            The agent reads this visual map and decides to run:
            <br/>
            <code>click_element({'{'} annotation_id: 3 {'}'})</code>.
            This triggers a click on element <code>[3]</code> programmatically without needing raw, massive HTML payloads.
          </p>

          <h3>Step 3: Scraping Page Text</h3>
          <p>
            Once the page loads, the agent calls <code>read_page_content()</code>. 
            The extension strips out styling and ads, returning a structured markdown text dump of the page content. The AI extracts dates, venues, and descriptions.
          </p>

          <h3>Step 4: Writing the Sandbox File</h3>
          <p>
            Finally, the agent structures the gathered meetups and writes them locally:
            <br/>
            <code>fs_create_file({'{'} path: '/sf-meetups.txt', content: '...' {'}'})</code>
            <br/>
            You can download the file to your host machine by typing <em>"Export sf-meetups.txt"</em>, which triggers <code>fs_export</code>.
          </p>
        </article>
      ),
    },
    skills: {
      title: 'Creating Custom Skills',
      render: () => (
        <article className="docs-article">
          <h2>Tutorial: Writing Custom Skills</h2>
          <p>
            A <strong>Skill</strong> is a markdown template that teaches the AI how to execute a specific, repetitive workflow. You can write custom skills in Settings → <strong>Skills</strong>.
          </p>

          <h3>1. Structure of a Skill File</h3>
          <p>
            Skills use markdown headings to declare their name, description, variables, and step-by-step instructions. Here is an example of a <strong>LinkedIn Job Summarizer</strong> skill:
          </p>

          <div className="code-block-wrapper">
            <div className="code-block-header">
              <span>job-summarizer.md</span>
            </div>
            <pre>{`# LinkedIn Job Summarizer

> Extracts key requirements from active LinkedIn job pages

## Description
Analyze a job listing URL, extract technical stacks and requirements, and save the result.

## Variables
- \`target_role\` — the job title/type we are interested in

## Instructions
1. Navigate to the job page using navigate_to.
2. Read the page content using read_page_content.
3. Search for references matching {{target_role}}.
4. Summarize the role, required experience, and tech stack.
5. Create a text file at /job-summary.txt containing the notes.`}</pre>
          </div>

          <h3>2. Using Placeholders</h3>
          <p>
            Wrap variables in double curly braces (e.g. <code>{"{{variable}}"}</code>). When the agent runs the skill, it evaluates variables from the prompt context, replacing the placeholders with the actual values.
          </p>

          <h3>3. Connecting a Skill Registry</h3>
          <p>
            To share skills across a team, you can host an <code>index.json</code> repository listing all skills. Point your BrowseCortex Settings → Skills registry URL to your server's endpoint to synchronize and download skills across your clients with one click.
          </p>
        </article>
      ),
    },
    relay: {
      title: 'Relay Server & CLI Control',
      render: () => (
        <article className="docs-article">
          <h2>Tutorial: Exposing BrowseCortex to CLIs</h2>
          <p>
            Expose your actual browser instance as an MCP server to terminal assistants (like Claude Code) or IDEs using the BrowseCortex WebSocket relay server.
          </p>

          <h3>Step 1: Enable the Relay Server in Settings</h3>
          <p>
            Open Settings → <strong>MCP Server</strong>, toggle <strong>Enable MCP Server</strong>, and note your secure access token (e.g. <code>sk-bc-df4c6...</code>).
          </p>

          <h3>Step 2: Run the Relay in Your Terminal</h3>
          <p>
            Run the official proxy relay using <code>npx</code>. This opens a local SSE endpoint pointing to your browser:
          </p>
          <div className="code-block-wrapper">
            <div className="code-block-header">
              <span>Terminal Command</span>
            </div>
            <pre>npx browsecortex-relay --port 7822 --token sk-bc-df4c6ba0...</pre>
          </div>

          <h3>Step 3: Hook Up Your Agent</h3>
          <p>
            Point your command-line agent at the relay's SSE port. For example, in Claude Code, add it as a tool:
          </p>
          <div className="code-block-wrapper">
            <div className="code-block-header">
              <span>Claude Code Config</span>
            </div>
            <pre>{`"mcpServers": {
  "browsecortex": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/client-sse", "http://localhost:7822/sse"]
  }
}`}</pre>
          </div>

          <h3>Step 4: Execute Commands</h3>
          <p>
            You can now ask your terminal assistant to navigate web pages or scrape text. It will connect to the relay, which forwards tool commands to your running browser tab over WebSockets, displaying pages in real-time as they load!
          </p>
        </article>
      ),
    },
  };

  return (
    <section className="section-tutorials">
      <div className="container docs-layout">
        {/* Sidebar Nav */}
        <aside className="docs-sidebar">
          <div className="sidebar-title">Tutorials</div>
          <div className="sidebar-nav">
            {(Object.keys(tutorials) as TutorialKey[]).map((key) => (
              <button
                key={key}
                className={`sidebar-btn ${activeTutorial === key ? 'active' : ''}`}
                onClick={() => setActiveTutorial(key)}
              >
                {tutorials[key].title}
              </button>
            ))}
          </div>
        </aside>

        {/* Tutorial Content */}
        <main className="docs-content">{tutorials[activeTutorial].render()}</main>
      </div>
    </section>
  );
}
