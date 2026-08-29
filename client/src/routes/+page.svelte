<script>
    import { onMount, onDestroy } from 'svelte';
    import { env } from '$env/dynamic/public';
    import { 
        connectSignaling, 
        peers, 
        connected, 
        localPeerId, 
        sendText, 
        sendFile, 
        incomingData,
        history,
        clearHistoryNetwork,
        requestFileNetwork
    } from '$lib/webrtc.js';
    
    let { data } = $props();
    let textToSend = $state('');
    let serverUrl = $state('');
    
    let dragOver = $state(false);
    let selectedPeer = $state('general'); 
    
    let isDarkMode = $state(false);
    let showInfo = $state(false);

    let filteredHistory = $derived($history.filter(item => {
        if (selectedPeer === 'general') {
            return item.peer === 'Everyone' || item.isBroadcast;
        } else {
            return (item.direction === 'in' && item.peer === selectedPeer && !item.isBroadcast) || 
                   (item.direction === 'out' && item.peer === selectedPeer);
        }
    }));

    onMount(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        serverUrl = env.PUBLIC_SIGNALING_URL || `${protocol}//${window.location.host}/ws-signaling`;
        connectSignaling(serverUrl);
        
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            setDarkTheme(true);
        }
    });

    function setDarkTheme(dark) {
        isDarkMode = dark;
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    const unsubscribe = incomingData.subscribe(data => {
        if (!data) return;
        
        if (data.type === 'file') {
            try {
                const url = URL.createObjectURL(data.data);
                const a = document.createElement('a');
                a.href = url;
                a.download = data.meta.fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch(e) {
                console.error("Auto-download failed", e);
            }
        }
    });

    onDestroy(() => {
        unsubscribe();
    });

    function handleSendText() {
        if (!textToSend.trim() || !selectedPeer) return;
        
        sendText(selectedPeer, textToSend);
        textToSend = '';
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendText();
        }
    }

    async function handleFileDrop(e) {
        e.preventDefault();
        dragOver = false;
        if (!selectedPeer) return;

        const items = e.dataTransfer.items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file') {
                    await sendFile(selectedPeer, items[i].getAsFile());
                }
            }
        } else {
            for (let i = 0; i < e.dataTransfer.files.length; i++) {
                await sendFile(selectedPeer, e.dataTransfer.files[i]);
            }
        }
    }
    
    async function handleFileSelect(e) {
        if (!selectedPeer) return;
        const files = e.target.files;
        for (let i = 0; i < files.length; i++) {
            await sendFile(selectedPeer, files[i]);
        }
    }

    function applyRename(newName) {
        newName = newName.trim();
        if (newName && newName !== $localPeerId) {
            connectSignaling(serverUrl, newName);
        }
    }
</script>

<div class="min-h-screen bg-[var(--bg-color)] text-[var(--text-primary)] font-sans flex flex-col justify-between selection:bg-[#BEE3F8] transition-colors duration-300">
    
    <!-- Top Action Bar -->
    <div class="w-full p-6 lg:px-12 lg:py-8 flex justify-between items-center gap-4 relative z-10">
        <div class="hidden lg:flex items-center gap-8 shrink-0">
            <h1 class="text-[32px] font-extrabold tracking-tighter text-[var(--text-primary)]">
                SwiftShare
            </h1>
            <div class="inline-flex items-center space-x-3 text-sm px-6 py-2.5 rounded-full clay-depressed font-medium text-[var(--text-secondary)]">
                <div class={`w-2.5 h-2.5 rounded-full ${$connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-400'}`}></div>
                <span>{$connected ? 'Connected to local mesh' : 'Connecting...'}</span>
            </div>
            {#if $localPeerId}
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-[var(--text-secondary)] tracking-wide">ID:</span>
                    <input 
                        type="text" 
                        value={$localPeerId}
                        maxlength="15"
                        class="bg-transparent border-b-2 border-transparent hover:border-[var(--text-secondary)] focus:border-[var(--text-primary)] text-[var(--text-primary)] text-sm font-bold w-32 px-1 focus:outline-none transition-colors"
                        onblur={(e) => applyRename(e.target.value)}
                        onkeydown={(e) => { if(e.key==='Enter') e.target.blur(); }}
                        title="Click to rename"
                    />
                </div>
            {/if}
        </div>

        <!-- Toggles -->
        <div class="flex w-full lg:w-auto justify-end gap-6 shrink-0">
            <button 
                class="w-14 h-14 lg:w-16 lg:h-16 rounded-full clay-raised flex items-center justify-center text-[var(--text-secondary)] active:clay-pressed outline-none transition-all"
                onclick={() => showInfo = !showInfo}
                aria-label="Info"
            >
                <svg class="w-6 h-6 lg:w-7 lg:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </button>
            <button 
                class="w-14 h-14 lg:w-16 lg:h-16 rounded-full clay-raised flex items-center justify-center text-[var(--text-secondary)] active:clay-pressed outline-none transition-all"
                onclick={() => setDarkTheme(!isDarkMode)}
                aria-label="Toggle Theme"
            >
                {#if isDarkMode}
                    <svg class="w-6 h-6 lg:w-7 lg:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                {:else}
                    <svg class="w-6 h-6 lg:w-7 lg:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                {/if}
            </button>
        </div>
    </div>

    <!-- Main Content Container -->
    <div class="flex-1 w-full max-w-[2000px] mx-auto px-6 pb-12 flex flex-col lg:flex-row gap-12 lg:gap-24 items-center lg:items-start justify-center lg:justify-start lg:pl-12">
        
        <!-- Left Column: Header (Mobile), Info, & Avatars -->
        <div class="w-full max-w-md lg:max-w-none lg:w-[450px] flex flex-col gap-10 lg:sticky lg:top-12 shrink-0">
            
            <!-- Mobile Header (Hidden on Desktop) -->
            <div class="text-center lg:hidden space-y-4">
                <h1 class="text-[48px] font-extrabold tracking-tighter text-[var(--text-primary)]">
                    SwiftShare
                </h1>
                <div class="inline-flex items-center space-x-3 text-sm px-6 py-3 rounded-full clay-depressed font-medium text-[var(--text-secondary)]">
                    <div class={`w-3 h-3 rounded-full ${$connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-400'}`}></div>
                    <span>{$connected ? 'Connected' : 'Connecting...'}</span>
                </div>
                {#if $localPeerId}
                    <div class="flex items-center justify-center gap-2 mt-2">
                        <span class="text-xs font-bold text-[var(--text-secondary)] tracking-wide">ID:</span>
                        <input 
                            type="text" 
                            value={$localPeerId}
                            maxlength="15"
                            class="bg-transparent border-b-2 border-transparent focus:border-[var(--text-secondary)] text-[var(--text-primary)] text-center text-sm font-bold w-32 px-1 focus:outline-none transition-colors"
                            onblur={(e) => applyRename(e.target.value)}
                            onkeydown={(e) => { if(e.key==='Enter') e.target.blur(); }}
                        />
                    </div>
                {/if}
            </div>

            <!-- Info Tab -->
            {#if showInfo}
                <div class="clay-raised rounded-[32px] p-8 animate-fade-in text-[var(--text-secondary)]">
                    <h3 class="font-bold text-[var(--text-primary)] mb-3 uppercase tracking-wider text-sm">How to use</h3>
                    <ol class="list-decimal list-inside space-y-3 text-sm font-medium leading-relaxed">
                        <li>Make sure both devices share the same Wi-Fi.</li>
                        <li>By default, you are sending to <b>General</b> (Broadcast to everyone).</li>
                        <li>To send privately, tap a specific device from the Radar.</li>
                        <li>Type text or drag a file to instantly share it!</li>
                    </ol>
                </div>
            {/if}

            <!-- Radar / Avatars -->
            <div class="flex flex-col items-center lg:items-start gap-4">
                <h2 class="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-widest lg:pl-2">Radar</h2>
                <div class="flex flex-wrap justify-center lg:justify-start gap-8 w-full py-4 lg:py-0">
                    
                    <!-- General Broadcast Avatar -->
                    <button 
                        class="flex flex-col items-center gap-4 transition-transform active:scale-95 outline-none focus:outline-none shrink-0"
                        onclick={() => selectedPeer = 'general'}
                    >
                        <div class="w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 {selectedPeer === 'general' ? 'clay-avatar-active scale-110' : 'clay-raised ring-4 ring-[var(--bg-primary)] ring-offset-4 ring-offset-[var(--bg-color)]'}">
                            <svg class="w-8 h-8 {selectedPeer === 'general' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <span class="text-xs font-bold text-[var(--text-secondary)]">General</span>
                    </button>

                    {#each [...$peers] as [id, peer]}
                        <button 
                            class="flex flex-col items-center gap-4 transition-transform active:scale-95 outline-none focus:outline-none shrink-0"
                            onclick={() => selectedPeer = id}
                        >
                            <div class="w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 {selectedPeer === id ? (peer.status === 'connected' ? 'clay-avatar-active scale-110' : 'clay-raised ring-4 ring-[var(--bg-primary)] ring-offset-4 ring-offset-[var(--bg-color)]') : 'clay-raised'}">
                                {#if peer.device === 'mobile'}
                                    <svg class="w-8 h-8 {selectedPeer === id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                {:else}
                                    <svg class="w-8 h-8 {selectedPeer === id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                {/if}
                            </div>
                            <span class="text-xs font-bold text-[var(--text-secondary)]">{id}</span>
                        </button>
                    {/each}
                </div>
            </div>
        </div>

        <!-- Right Column: Workspace -->
        <div class="w-full max-w-md lg:max-w-none flex-1 flex flex-col gap-10 transition-opacity duration-500 {selectedPeer ? 'opacity-100' : 'opacity-25 pointer-events-none'}">
            
            <!-- Text Input Area -->
            <div class="flex flex-col gap-6 w-full lg:h-full">
                <textarea 
                    bind:value={textToSend}
                    placeholder="Type a message... (Press Enter to send, Shift+Enter for new line)" 
                    class="w-full min-h-[160px] lg:min-h-[250px] resize-y clay-depressed rounded-[32px] px-8 py-6 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none font-medium text-lg leading-relaxed custom-scrollbar"
                    onkeydown={handleKeyDown}
                ></textarea>
                
                <div class="flex gap-4">
                    <button 
                        class="flex-1 clay-raised rounded-[32px] py-4 font-bold text-[var(--text-secondary)] active:clay-pressed transition-all" 
                        onclick={async () => {
                            try { textToSend = await navigator.clipboard.readText(); } catch(e) {}
                        }}
                    >
                        Paste
                    </button>
                    <button 
                        onclick={handleSendText}
                        class="flex-[2] clay-primary rounded-[32px] py-4 font-extrabold transition-all disabled:opacity-60 disabled:active:box-shadow-[var(--shadow-primary)]"
                        disabled={!textToSend.trim()}
                    >
                        Push to {selectedPeer === 'general' ? 'Everyone' : selectedPeer}
                    </button>
                </div>
            </div>

            <!-- Desktop Grid for Dropzone & History -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <!-- Drop Zone Area -->
                <div 
                    role="button"
                    tabindex="0"
                    class="w-full h-56 lg:h-full lg:min-h-[250px] rounded-[48px] flex flex-col items-center justify-center transition-all duration-300 cursor-pointer outline-none {dragOver ? 'clay-pressed scale-[0.98]' : 'clay-depressed hover:scale-[0.99]'}"
                    ondragover={(e) => { e.preventDefault(); dragOver = true; }}
                    ondragleave={() => dragOver = false}
                    ondrop={handleFileDrop}
                    onclick={() => document.getElementById('fileInput').click()}
                    onkeydown={(e) => e.key === 'Enter' && document.getElementById('fileInput').click()}
                >
                    <input type="file" id="fileInput" class="hidden" multiple onchange={handleFileSelect} />
                    <svg class="w-12 h-12 text-[var(--text-secondary)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span class="text-base font-bold text-[var(--text-secondary)]">Tap or Drop File</span>
                </div>
                
                <!-- History -->
                {#if filteredHistory.length > 0}
                    <div class="space-y-6 lg:h-full lg:max-h-[400px] lg:overflow-y-auto custom-scrollbar lg:pr-4">
                        <div class="flex items-center justify-between pl-4">
                            <h3 class="font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em] text-xs">Transfer History</h3>
                            <button 
                                class="text-xs font-bold text-rose-400 hover:text-rose-500 transition-colors uppercase tracking-wider"
                                onclick={clearHistoryNetwork}
                            >
                                Clear All
                            </button>
                        </div>
                        <div class="space-y-6">
                            {#each filteredHistory as item (item.id)}
                                <div class="clay-raised rounded-[32px] p-6 flex items-center justify-between gap-4 animate-fade-in-up">
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 text-[10px] font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                                            {#if item.direction === 'out'}
                                                <svg class="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                                <span class="truncate">Sent to {item.peer}</span>
                                            {:else}
                                                <svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                                                <span class="truncate">From {item.peer}</span>
                                            {/if}
                                            <span class="shrink-0">&bull; {item.time}</span>
                                        </div>
                                        <div class="text-base font-semibold text-[var(--text-primary)] truncate">{item.content}</div>
                                    </div>
                                    
                                    {#if item.type === 'text'}
                                        <button 
                                            class="clay-raised w-14 h-14 rounded-full flex items-center justify-center text-[var(--text-secondary)] active:clay-pressed shrink-0 transition-all" 
                                            onclick={() => {
                                                if (navigator.clipboard) navigator.clipboard.writeText(item.content);
                                            }}
                                            aria-label="Copy text"
                                        >
                                            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                        </button>
                                    {:else if item.type === 'file'}
                                        <button 
                                            class="clay-raised w-14 h-14 rounded-full flex items-center justify-center text-[var(--text-secondary)] active:clay-pressed shrink-0 transition-all hover:text-[var(--text-primary)]" 
                                            onclick={() => requestFileNetwork(item.id)}
                                            aria-label="Download file"
                                            title="Download File"
                                        >
                                            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                        </button>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>

        </div>
    </div>

    <!-- Footer Social Links -->
    <div class="w-full py-8 flex justify-center gap-8 text-[var(--text-secondary)] z-10 shrink-0 mt-auto">
        <a href="https://www.linkedin.com/in/jagtar-singh-151a9a2b1/" target="_blank" rel="noopener noreferrer" class="hover:text-[var(--text-primary)] transition-colors" aria-label="LinkedIn">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
        </a>
        <a href="https://github.com/jagtar5/SwiftShare" target="_blank" rel="noopener noreferrer" class="hover:text-[var(--text-primary)] transition-colors" aria-label="GitHub">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        </a>
        <a href="https://www.instagram.com/jagtarsingh.__" target="_blank" rel="noopener noreferrer" class="hover:text-[var(--text-primary)] transition-colors" aria-label="Instagram">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
        </a>
        <a href="mailto:jagtar3125@gmail.com" class="hover:text-[var(--text-primary)] transition-colors" aria-label="Email">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
        </a>
    </div>

</div>

<style>
    button {
        user-select: none;
        -webkit-tap-highlight-color: transparent;
    }
    
    @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in-up {
        animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    .animate-fade-in {
        animation: fadeIn 0.3s ease-out forwards;
    }

    /* Custom elegant clay scrollbar for textareas and overflow areas */
    .custom-scrollbar::-webkit-scrollbar {
        width: 14px;
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background-color: var(--text-secondary);
        border-radius: 20px;
        border: 4px solid var(--bg-color);
        opacity: 0.5;
    }
</style>
