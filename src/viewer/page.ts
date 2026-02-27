export function createPage(container: HTMLElement) {
    let pageHTML = `
        <div id="treeContainer">
            <svg id="tree"></svg>
            <div class="legend">
                <span class="text-xs font-medium mb-1 block">Reply Times</span>
                <span class="legend-item"><span class="w-2 h-2 rounded-full bg-rose-500"></span>5m</span>
                <span class="legend-item"><span class="w-2 h-2 rounded-full bg-yellow-400"></span>10m</span>
                <span class="legend-item"><span class="w-2 h-2 rounded-full bg-amber-100"></span>1h</span>
                <span class="legend-item"><span class="w-2 h-2 rounded-full bg-cyan-400"></span>3h+</span>
            </div>
        </div>
        <div id="sidebar" class="bg-base-200">
            <div id="infoBox" class="hidden">
                <div id="toolbar"></div>
            </div>
            <div id="feedContainer">
                <div id="feedInner">
                    <div id="feed" class="space-y-3">
                    </div>
                </div>
            </div>
        </div>
    `

    container.innerHTML = pageHTML
}
