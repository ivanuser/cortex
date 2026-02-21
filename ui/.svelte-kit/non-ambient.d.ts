
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/agents" | "/approvals" | "/channels" | "/config" | "/cron" | "/debug" | "/instances" | "/logs" | "/memory" | "/nodes" | "/overview" | "/sessions" | "/settings" | "/skills" | "/usage";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/": Record<string, never>;
			"/agents": Record<string, never>;
			"/approvals": Record<string, never>;
			"/channels": Record<string, never>;
			"/config": Record<string, never>;
			"/cron": Record<string, never>;
			"/debug": Record<string, never>;
			"/instances": Record<string, never>;
			"/logs": Record<string, never>;
			"/memory": Record<string, never>;
			"/nodes": Record<string, never>;
			"/overview": Record<string, never>;
			"/sessions": Record<string, never>;
			"/settings": Record<string, never>;
			"/skills": Record<string, never>;
			"/usage": Record<string, never>
		};
		Pathname(): "/" | "/agents" | "/approvals" | "/channels" | "/config" | "/cron" | "/debug" | "/instances" | "/logs" | "/memory" | "/nodes" | "/overview" | "/sessions" | "/settings" | "/skills" | "/usage";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/config.json" | "/logo.png" | "/manifest.json" | "/sw.js" | string & {};
	}
}