import { describe, expect, it } from "vitest";
import {
	buildAgentSessionCommand,
	parseAgentSessionContent,
} from "#/lib/agent-sessions";

const cursorTranscript = [
	JSON.stringify({
		role: "user",
		message: {
			content: [
				{
					type: "text",
					text: "<user_query>\ntheme_preferences 를 어떻게 셋팅하고 있지? 플로우를 그려서 설명해줘\n</user_query>",
				},
			],
		},
	}),
	JSON.stringify({
		role: "assistant",
		message: {
			content: [
				{
					type: "text",
					text: "작업 `DEMO-101` 생성됨. main 기준 브랜치 생성 후 수정 진행.",
				},
				{
					type: "tool_use",
					name: "Shell",
					input: {
						command:
							"cd /Users/tester/Projects/web-app && git checkout -b feature/DEMO-101-settings-panel",
					},
				},
			],
		},
	}),
	JSON.stringify({
		role: "assistant",
		message: {
			content: [
				{
					type: "text",
					text: "PR 완료: https://example.test/example-workspace/web-app/pull-requests/42",
				},
			],
		},
	}),
].join("\n");

describe("agent session matching", () => {
	it("extracts a strong Cursor session match from task, branch, and PR signals", () => {
		const session = parseAgentSessionContent({
			agentType: "cursor",
			transcriptPath:
				"/Users/tester/.cursor/projects/Users-tester-Projects-web-app/agent-transcripts/123e4567-e89b-42d3-a456-426614174000/123e4567-e89b-42d3-a456-426614174000.jsonl",
			content: cursorTranscript,
			match: {
				taskKey: "DEMO-101",
				branches: ["feature/DEMO-101-settings-panel"],
				reviews: [
					{
						id: "42",
						url: "https://example.test/example-workspace/web-app/pull-requests/42",
					},
				],
			},
		});

		expect(session).toMatchObject({
			agentType: "cursor",
			sessionId: "123e4567-e89b-42d3-a456-426614174000",
			title:
				"theme_preferences 를 어떻게 셋팅하고 있지? 플로우를 그려서 설명해줘",
			summary:
				"theme_preferences 를 어떻게 셋팅하고 있지? 플로우를 그려서 설명해줘",
			lastUserMessage:
				"theme_preferences 를 어떻게 셋팅하고 있지? 플로우를 그려서 설명해줘",
			cwd: "/Users/tester/Projects/web-app",
			branch: "feature/DEMO-101-settings-panel",
			canResume: true,
		});
		expect(session?.matchReasons).toContain("task DEMO-101");
		expect(session?.matchReasons).toContain("review 42");
		expect(session?.score).toBeGreaterThanOrEqual(200);
	});

	it("ignores image-only transcript notes when choosing a session summary", () => {
		const session = parseAgentSessionContent({
			agentType: "cursor",
			transcriptPath:
				"/Users/tester/.cursor/projects/Users-tester-Projects-web-app/agent-transcripts/123e4567-e89b-42d3-a456-426614174000/123e4567-e89b-42d3-a456-426614174000.jsonl",
			content: [
				cursorTranscript,
				JSON.stringify({
					role: "user",
					message: {
						content: [
							{
								type: "text",
								text: "[Image] The following images were provided by the user and saved to the workspace for future use: 1. /tmp/codex-clipboard.png",
							},
						],
					},
				}),
			].join("\n"),
			match: {
				taskKey: "DEMO-101",
				branches: ["feature/DEMO-101-settings-panel"],
				reviews: [
					{
						id: "42",
						url: "https://example.test/example-workspace/web-app/pull-requests/42",
					},
				],
			},
		});

		expect(session).toMatchObject({
			summary:
				"theme_preferences 를 어떻게 셋팅하고 있지? 플로우를 그려서 설명해줘",
			lastUserMessage:
				"theme_preferences 를 어떻게 셋팅하고 있지? 플로우를 그려서 설명해줘",
		});
	});

	it("uses a Codex session index title when one is provided", () => {
		const session = parseAgentSessionContent({
			agentType: "codex",
			transcriptPath:
				"/Users/tester/.codex/sessions/2026/06/15/rollout-2026-06-15T10-25-47-123e4567-e89b-42d3-a456-426614174001.jsonl",
			sessionTitle: "브랜치와 에이전트 연결 복구",
			content: [
				JSON.stringify({
					timestamp: "2026-06-15T01:28:20.647Z",
					type: "session_meta",
					payload: {
						id: "123e4567-e89b-42d3-a456-426614174001",
						cwd: "/Users/tester/Projects/my-workbench",
					},
				}),
				JSON.stringify({
					type: "response_item",
					payload: {
						type: "message",
						role: "user",
						content: [
							{
								type: "input_text",
								text: "PR도 만든 상태고 브랜치와 에이전트 세션을 DEMO-101에 연결해줘",
							},
						],
					},
				}),
				JSON.stringify({
					type: "response_item",
					payload: {
						type: "message",
						role: "assistant",
						content: [
							{
								type: "output_text",
								text: "feature/DEMO-101-settings-panel 브랜치와 review 42을 연결합니다.",
							},
						],
					},
				}),
			].join("\n"),
			match: {
				taskKey: "DEMO-101",
				branches: ["feature/DEMO-101-settings-panel"],
				reviews: [
					{
						id: "42",
						url: "https://example.test/example-workspace/web-app/pull-requests/42",
					},
				],
			},
		});

		expect(session).toMatchObject({
			agentType: "codex",
			sessionId: "123e4567-e89b-42d3-a456-426614174001",
			title: "브랜치와 에이전트 연결 복구",
			summary: "PR도 만든 상태고 브랜치와 에이전트 세션을 DEMO-101에 연결해줘",
			lastUserMessage:
				"PR도 만든 상태고 브랜치와 에이전트 세션을 DEMO-101에 연결해줘",
		});
	});

	it("summarizes the actual user request instead of Codex attachment preamble", () => {
		const session = parseAgentSessionContent({
			agentType: "codex",
			transcriptPath:
				"/Users/tester/.codex/sessions/2026/06/15/rollout-2026-06-15T10-25-47-123e4567-e89b-42d3-a456-426614174001.jsonl",
			sessionTitle: "브랜치와 에이전트 연결 복구",
			content: [
				JSON.stringify({
					type: "session_meta",
					payload: {
						id: "123e4567-e89b-42d3-a456-426614174001",
						cwd: "/Users/tester/Projects/my-workbench",
					},
				}),
				JSON.stringify({
					type: "response_item",
					payload: {
						type: "message",
						role: "user",
						content: [
							{
								type: "input_text",
								text: [
									"# Files mentioned by the user:",
									"## codex-clipboard.png: /tmp/codex-clipboard.png",
									"## My request for Codex:",
									"https://example.test/example-workspace/web-app/pull-requests/42/overview",
									"pr 도 만든 상태고, 브랜치와 에이전트 세션을 DEMO-101에 연결해줘",
									'<image name=[Image #1] path="/tmp/codex-clipboard.png">...</image>',
								].join("\n\n"),
							},
						],
					},
				}),
				JSON.stringify({
					type: "response_item",
					payload: {
						type: "message",
						role: "assistant",
						content: [
							{
								type: "output_text",
								text: "feature/DEMO-101-settings-panel 브랜치와 review 42을 연결합니다.",
							},
						],
					},
				}),
			].join("\n"),
			match: {
				taskKey: "DEMO-101",
				branches: ["feature/DEMO-101-settings-panel"],
				reviews: [
					{
						id: "42",
						url: "https://example.test/example-workspace/web-app/pull-requests/42",
					},
				],
			},
		});

		expect(session).toMatchObject({
			title: "브랜치와 에이전트 연결 복구",
			summary:
				"https://example.test/example-workspace/web-app/pull-requests/42/overview pr 도 만든 상태고, 브랜치와 에이전트 세션을 DEMO-101에 연결해줘",
			lastUserMessage:
				"https://example.test/example-workspace/web-app/pull-requests/42/overview pr 도 만든 상태고, 브랜치와 에이전트 세션을 DEMO-101에 연결해줘",
		});
	});

	it("does not index Codex subagent sessions as resumable work sessions", () => {
		const session = parseAgentSessionContent({
			agentType: "codex",
			transcriptPath:
				"/Users/tester/.codex/sessions/2026/06/15/rollout-2026-06-15T10-34-04-123e4567-e89b-42d3-a456-426614174002.jsonl",
			content: [
				JSON.stringify({
					timestamp: "2026-06-15T01:34:04.973Z",
					type: "session_meta",
					payload: {
						id: "123e4567-e89b-42d3-a456-426614174002",
						thread_source: "subagent",
						source: { subagent: { other: "guardian" } },
						cwd: "/Users/tester/Projects/my-workbench",
					},
				}),
				JSON.stringify({
					type: "response_item",
					payload: {
						type: "message",
						role: "user",
						content: [
							{
								type: "input_text",
								text: "DEMO-101 review 42 feature/DEMO-101-settings-panel",
							},
						],
					},
				}),
			].join("\n"),
			match: {
				taskKey: "DEMO-101",
				branches: ["feature/DEMO-101-settings-panel"],
				reviews: [
					{
						id: "42",
						url: "https://example.test/example-workspace/web-app/pull-requests/42",
					},
				],
			},
		});

		expect(session).toBeNull();
	});

	it("does not score Codex instructions or developer context as work-session matches", () => {
		const session = parseAgentSessionContent({
			agentType: "codex",
			transcriptPath:
				"/Users/tester/.codex/sessions/2026/06/15/rollout-2026-06-15T13-13-36-123e4567-e89b-42d3-a456-426614174003.jsonl",
			sessionTitle: "ponytail 플러그인 설치",
			content: [
				JSON.stringify({
					timestamp: "2026-06-15T04:13:36.600Z",
					type: "session_meta",
					payload: {
						id: "123e4567-e89b-42d3-a456-426614174003",
						cwd: "/Users/tester/Documents/Codex/2026-06-15/demo-plugin",
						thread_source: "user",
						base_instructions: {
							text: "Prior context mentions DEMO-101 review 42 feature/DEMO-101-settings-panel.",
						},
					},
				}),
				JSON.stringify({
					type: "response_item",
					payload: {
						type: "message",
						role: "developer",
						content: [
							{
								type: "input_text",
								text: "Memory says DEMO-101 review 42 feature/DEMO-101-settings-panel.",
							},
						],
					},
				}),
				JSON.stringify({
					type: "response_item",
					payload: {
						type: "message",
						role: "user",
						content: [
							{
								type: "input_text",
								text: "[example/demo-plugin](https://github.com/example/demo-plugin) 이 플러그인 설치해줘",
							},
						],
					},
				}),
			].join("\n"),
			match: {
				taskKey: "DEMO-101",
				branches: ["feature/DEMO-101-settings-panel"],
				reviews: [
					{
						id: "42",
						url: "https://example.test/example-workspace/web-app/pull-requests/42",
					},
				],
				repoPaths: ["/Users/tester/Projects/web-app"],
			},
		});

		expect(session).toBeNull();
	});

	it("does not match a session from a low-weight keyword alone", () => {
		const session = parseAgentSessionContent({
			agentType: "cursor",
			transcriptPath:
				"/Users/tester/.cursor/projects/Users-tester-Projects-web-app/agent-transcripts/noisy/noisy.jsonl",
			content: JSON.stringify({
				role: "assistant",
				message: {
					content: [{ type: "text", text: "theme_preferences 확인" }],
				},
			}),
			match: {
				taskKey: "DEMO-101",
				keywords: ["theme_preferences"],
			},
		});

		expect(session).toBeNull();
	});

	it("treats child task aliases as strong task matches", () => {
		const session = parseAgentSessionContent({
			agentType: "cursor",
			transcriptPath:
				"/Users/tester/.cursor/projects/Users-tester-cursor-worktrees-web-app-web-next/agent-transcripts/123e4567-e89b-42d3-a456-426614174004/123e4567-e89b-42d3-a456-426614174004.jsonl",
			content: JSON.stringify({
				role: "user",
				message: {
					content: [
						{
							type: "text",
							text: "DEMO-102 web-next 파일럿 PR 작업",
						},
					],
				},
			}),
			match: {
				taskKey: "DEMO-100",
				taskAliases: ["DEMO-102"],
			},
		});

		expect(session?.matchReasons).toContain("task DEMO-102");
		expect(session?.score).toBeGreaterThanOrEqual(100);
	});

	it("prefers the matched worktree path over an earlier repo-root shell command", () => {
		const session = parseAgentSessionContent({
			agentType: "cursor",
			transcriptPath:
				"/Users/tester/.cursor/projects/Users-tester-cursor-worktrees-web-app-web-next/agent-transcripts/123e4567-e89b-42d3-a456-426614174004/123e4567-e89b-42d3-a456-426614174004.jsonl",
			content: [
				JSON.stringify({
					role: "assistant",
					message: {
						content: [
							{
								type: "tool_use",
								name: "Shell",
								input: {
									command:
										"cd /Users/tester/Projects/web-app && git branch --show-current",
								},
							},
						],
					},
				}),
				JSON.stringify({
					role: "assistant",
					message: {
						content: [
							{
								type: "tool_use",
								name: "Read",
								input: {
									path: "/Users/tester/.cursor/worktrees/web-app/web-next/apps/web-next/app/layout.tsx",
								},
							},
						],
					},
				}),
				JSON.stringify({
					role: "user",
					message: {
						content: [
							{
								type: "text",
								text: "DEMO-102 web-next 작업 이어서 해줘",
							},
						],
					},
				}),
			].join("\n"),
			match: {
				taskKey: "DEMO-100",
				taskAliases: ["DEMO-102"],
				repoPaths: [
					"/Users/tester/Projects/web-app",
					"/Users/tester/.cursor/worktrees/web-app/web-next",
				],
			},
		});

		expect(session?.cwd).toBe(
			"/Users/tester/.cursor/worktrees/web-app/web-next",
		);
	});

	it("uses transcript mtime when a Cursor transcript has no timestamp fields", () => {
		const session = parseAgentSessionContent({
			agentType: "cursor",
			transcriptPath:
				"/Users/tester/.cursor/projects/Users-tester-Projects-web-app/agent-transcripts/123e4567-e89b-42d3-a456-426614174000/123e4567-e89b-42d3-a456-426614174000.jsonl",
			content: JSON.stringify({
				role: "user",
				message: {
					content: [
						{
							type: "text",
							text: "DEMO-101 feature/DEMO-101-settings-panel",
						},
					],
				},
			}),
			match: {
				taskKey: "DEMO-101",
				branches: ["feature/DEMO-101-settings-panel"],
			},
			transcriptMtime: "2026-06-15T04:36:50.000Z",
		} as Parameters<typeof parseAgentSessionContent>[0] & {
			transcriptMtime: string;
		});

		expect(session?.lastActiveAt).toBe("2026-06-15T04:36:50.000Z");
	});

	it("builds resumable commands without executing the agent", () => {
		const command = buildAgentSessionCommand({
			agentType: "cursor",
			sessionId: "123e4567-e89b-42d3-a456-426614174000",
			cwd: "/Users/tester/Projects/web-app",
		});

		expect(command).toBe(
			"cd '/Users/tester/Projects/web-app' && agent --workspace '/Users/tester/Projects/web-app' --resume '123e4567-e89b-42d3-a456-426614174000'",
		);
	});

	it("builds Codex resume commands in the supported argument order", () => {
		const command = buildAgentSessionCommand({
			agentType: "codex",
			sessionId: "123e4567-e89b-42d3-a456-426614174002",
			cwd: "/Users/tester/Projects/web-app",
		});

		expect(command).toBe(
			"codex resume '123e4567-e89b-42d3-a456-426614174002' --cd '/Users/tester/Projects/web-app'",
		);
	});
});
