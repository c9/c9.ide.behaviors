/**
 * Tab Behaviors for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {
    main.consumes = [
        "plugin", "settings", "menus", "preferences", "commands", 
        "tabs", "ui", "save", "panels", "tree"
    ];
    main.provides = ["tabbehavior"];
    return main;
    
    //@todo collect closed pages in mnuEditors

    function main(options, imports, register) {
        var Plugin   = imports.plugin;
        var settings = imports.settings;
        var tabs     = imports.tabs;
        var menus    = imports.menus;
        var commands = imports.commands;
        var tree     = imports.tree;
        var save     = imports.save;
        var panels   = imports.panels;
        var ui       = imports.ui;
        var prefs    = imports.preferences;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit   = plugin.getEmitter();
        
        var mnuContext, mnuEditors, mnuTabs;
        var menuItems = [], menuClosedItems = [];
        
        var accessList  = [];
        var accessedTab = 0;
        
        var paneList     = [];
        var accessedPane = 0;
        paneList.add     = function(page, first){
            var tab = page.tab, found;
            this.every(function(page){
                if (page.tab && page.tab == tab) {
                    found = page;
                    return false;
                }
                return true;
            })
            if (found) this.remove(found);
            
            if (first == 2)
                this.splice(1, 0, page);
            else if (first) 
                this.unshift(page) 
            else 
                this.push(page);
        }
        
        var cycleKey     = apf.isMac ? 18 : 17;
        var paneCycleKey = 192;
        
        var cycleKeyPressed, changedPages, unchangedPages, dirtyNextTab;

        var ACTIVEPAGE = function(){ return tabs.focussedPage; };
        var ACTIVEPATH = function(){ return (tabs.focussedPage || 1).path; };
        var MOREPAGES  = function(){ return tabs.getPages().length > 1 };
        var MORETABS   = function(){ return tabs.getTabs(tabs.container).length > 1 };
        
        var movekey = "Command-Option-Shift"
        var definition = [
            ["closetab",       "Option-W",         "Alt-W",           ACTIVEPAGE, "close the tab that is currently active"],
            ["closealltabs",   "Option-Shift-W",   "Alt-Shift-W",     ACTIVEPAGE, "close all opened tabs"],
            ["closeallbutme",  "Option-Ctrl-W",    "Ctrl-Alt-W",      MOREPAGES,  "close all opened tabs, except the tab that is currently active"],
            ["gototabright",   "Command-]",        "Ctrl-]",          MOREPAGES,  "navigate to the next tab, right to the tab that is currently active"],
            ["gototableft",    "Command-[",        "Ctrl-[",          MOREPAGES,  "navigate to the next tab, left to the tab that is currently active"],
            ["movetabright",   movekey + "-Right", "Ctrl-Meta-Right", MOREPAGES,  "move the tab that is currently active to the right. Will create a split pane to the right if it's the right most tab."],
            ["movetableft",    movekey + "-Left",  "Ctrl-Meta-Left",  MOREPAGES,  "move the tab that is currently active to the left. Will create a split pane to the left if it's the left most tab."],
            ["movetabup",      movekey + "-Up",    "Ctrl-Meta-Up",    MOREPAGES,  "move the tab that is currently active to the up. Will create a split pane to the top if it's the top most tab."],
            ["movetabdown",    movekey + "-Down",  "Ctrl-Meta-Down",  MOREPAGES,  "move the tab that is currently active to the down. Will create a split pane to the bottom if it's the bottom most tab."],
            ["tab1",           "Command-1",        "Ctrl-1",          null,       "navigate to the first tab"],
            ["tab2",           "Command-2",        "Ctrl-2",          null,       "navigate to the second tab"],
            ["tab3",           "Command-3",        "Ctrl-3",          null,       "navigate to the third tab"],
            ["tab4",           "Command-4",        "Ctrl-4",          null,       "navigate to the fourth tab"],
            ["tab5",           "Command-5",        "Ctrl-5",          null,       "navigate to the fifth tab"],
            ["tab6",           "Command-6",        "Ctrl-6",          null,       "navigate to the sixth tab"],
            ["tab7",           "Command-7",        "Ctrl-7",          null,       "navigate to the seventh tab"],
            ["tab8",           "Command-8",        "Ctrl-8",          null,       "navigate to the eighth tab"],
            ["tab9",           "Command-9",        "Ctrl-9",          null,       "navigate to the ninth tab"],
            ["tab0",           "Command-0",        "Ctrl-0",          null,       "navigate to the tenth tab"],
            ["revealtab",      "Shift-Command-L",  "Ctrl-Shift-L",    ACTIVEPATH, "reveal current tab in the file tree"],
            ["nexttab",        "Option-Tab",       "Ctrl-Tab",        MOREPAGES,  "navigate to the next tab in the stack of accessed tabs"],
            ["previoustab",    "Option-Shift-Tab", "Ctrl-Shift-Tab",  MOREPAGES,  "navigate to the previous tab in the stack of accessed tabs"],
            ["nextpane",       "Option-L",         "Ctrl-`",          MORETABS,   "navigate to the next pane in the stack of panes"],
            ["previouspane",   "Option-Shift-L",   "Ctrl-Shift-`",    MORETABS,   "navigate to the previous pane in the stack of panes"],
            ["closealltotheright", "", "", function(){
                var page = mnuContext.$page || mnuContext.$tab && mnuContext.$tab.getPage();
                if (page) {
                    var pages = page.tab.getPages();
                    return pages.pop() != page;
                }
            }, "close all tabs to the right of the focussed page"],
            ["closealltotheleft", "", "", function(){
                var page = mnuContext.$page || mnuContext.$tab && mnuContext.$tab.getPage();
                if (page) {
                    var pages = page.tab.getPages();
                    return pages.length > 1 && pages[0] != page;
                }
            }, "close all tabs to the left of the focussed page"],
            ["closepane", "Command-Ctrl-W", "Ctrl-W", function(){
                return mnuContext.$page || tabs.getTabs().length > 1;
            },  "close all tabs in this pane"],
            ["hsplit",     "", "", null, "split the current pane horizontally and move the active page to it"],
            ["vsplit",     "", "", null, "split the current pane horizontally and move the active page to it"],
            ["twovsplit",  "", "", null, "create a two pane vertical layout"],
            ["twohsplit",  "", "", null, "create a two pane horizontal layout"],
            ["foursplit",  "", "", null, "create a four pane layout"],
            ["threeleft",  "", "", null, "create a three pane layout with the stack on the left side"],
            ["threeright", "", "", null, "create a three pane layout with the stack on the right side"]
        ];
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            // Settings
            settings.on("read", function(e){
                settings.setDefaults("user/general", [["revealfile", false]]);
                
                var list = settings.getJson("state/tabcycle");
                if (list) {
                    list.remove(null);
                    accessList = list;
                }
                var list = settings.getJson("state/panecycle");
                if (list) {
                    list.remove(null);
                }
            });
            
            settings.on("write", function(e){
                // @todo save menuClosedItems
                
                if (accessList.changed) {
                    var list = [];
                    accessList.forEach(function(page, i){
                        if (page && page.name)
                            list.push(page.name);
                    });
                    settings.setJson("state/tabcycle", list);
                    accessList.changed = false;
                }
                if (paneList.changed) {
                    var list = [];
                    paneList.forEach(function(page, i){
                        if (page && page.name)
                            list.push(page.name);
                    });
                    settings.setJson("state/panecycle", list);
                    paneList.changed = false;
                }
            });
    
            // Preferences
            prefs.add({
                "General" : {
                    "General" : {
                        "Reveal Active File in Project Tree" : {
                            type     : "checkbox",
                            position : 4000,
                            path     : "user/general/@revealfile"
                        }
                    }
                }
            }, plugin);
            
            // Commands
            definition.forEach(function(item){
                commands.addCommand({
                    name        : item[0],
                    bindKey     : { mac: item[1], win: item[2] },
                    group       : "Tabs",
                    hint        : item[4],
                    isAvailable : item[3],
                    exec        : function (editor, arg) {
                        if (arg && !arg[0] && arg.source == "click")
                            arg = [mnuContext.$page, mnuContext.$tab];
                        plugin[item[0]].apply(plugin, arg);
                    }
                }, plugin);
            });
            
            // General Menus
            menus.addItemByPath("File/~", new apf.divider(), 100000, plugin);
            menus.addItemByPath("File/Close File", new apf.item({
                command: "closetab"
            }), 110000, plugin);
            menus.addItemByPath("File/Close All Files", new apf.item({
                command : "closealltabs"
            }), 120000, plugin);

            menus.addItemByPath("Window/Tabs/Close Pane", new apf.item({
                command : "closepane"
            }), 100, plugin);
            menus.addItemByPath("Window/Tabs/Close All Tabs", new apf.item({
                command : "closealltabs"
            }), 200, plugin);
            menus.addItemByPath("Window/Tabs/Close All But Current Tab", new apf.item({
                command : "closeallbutme"
            }), 300, plugin);
            
            menus.addItemByPath("Window/Tabs/~", new apf.divider(), 1000000, plugin);
            menus.addItemByPath("Window/Tabs/Split Pane Vertically", new apf.item({
                command : "vsplit"
            }), 1000100, plugin);
            menus.addItemByPath("Window/Tabs/Split Pane Horizontally", new apf.item({
                command : "hsplit"
            }), 1000200, plugin);
            menus.addItemByPath("Window/Tabs/~", new apf.divider(), 1000300, plugin);
            
            menus.addItemByPath("Window/Tabs/~", new apf.label({
                "class"   : "splits",
                "caption" : "<span class='nosplit'></span>"
                    + "<span class='twovsplit'></span>"
                    + "<span class='twohsplit'></span>"
                    + "<span class='foursplit'></span>"
                    + "<span class='threeleft'></span>"
                    + "<span class='threeright'></span>",
                "onclick" : function(e){
                    var span = e.htmlEvent.target;
                    if (!span || span.tagName != "SPAN") return;
                    plugin[span.className]();
                    mnuTabs.hide();
                }
            }), 1000400, plugin);

            menus.addItemByPath("Goto/~", new apf.divider(), 300, plugin);

            menus.addItemByPath("Goto/Switch File/", null, 301, plugin);

            menus.addItemByPath("Goto/Switch File/Next File", new apf.item({
                command : "gototabright"
            }), 100, plugin);

            menus.addItemByPath("Goto/Switch File/Previous File", new apf.item({
                command : "gototableft"
            }), 200, plugin);

            menus.addItemByPath("Goto/Switch File/~", new apf.divider(), 300, plugin);

            menus.addItemByPath("Goto/Switch File/Next File in Stack", new apf.item({
                command : "nexttab"
            }), 400, plugin);

            menus.addItemByPath("Goto/Switch File/Previous File in Stack", new apf.item({
                command : "previoustab"
            }), 500, plugin);

            menus.addItemByPath("Goto/Switch File/~", new apf.divider(), 300, plugin);

            menus.addItemByPath("Goto/Switch File/Next Pane in Stack", new apf.item({
                command : "nextpane"
            }), 400, plugin);

            menus.addItemByPath("Goto/Switch File/Previous Pane in Stack", new apf.item({
                command : "previouspane"
            }), 500, plugin);
            
            // Tab Helper Menu
            menus.addItemByPath("Window/~", new ui.divider(), 10000, plugin);
            mnuTabs = menus.addItemByPath("Window/Tabs", null, 10100, plugin);
            
            mnuTabs.addEventListener("prop.visible", function(e) {
                if (e.value) {
                    if (mnuTabs.opener && mnuTabs.opener.parentNode.localName == "tab") {
                        mnuContext.$tab  = mnuTabs.opener.parentNode.cloud9tab;
                        mnuContext.$page = mnuContext.$tab.getPage();
                    }
                    updateTabMenu();
                }
                else {
                    removeContextInfo(e);
                }
                
                if (mnuTabs.opener && mnuTabs.opener["class"] == "tabmenubtn")
                    apf.setStyleClass(mnuTabs.$ext, "tabsContextMenu");
                else
                    apf.setStyleClass(mnuTabs.$ext, "", ["tabsContextMenu"]);
            }, true);

            // Tab Context Menu
            mnuContext = new apf.menu({id : "mnuContext"});
            menus.importMenu(mnuContext);
            plugin.addElement(mnuContext);

            function removeContextInfo(e) {
                if (!e.value) {
                    // use setTimeout because apf closes menu before menuitem onclick event
                    setTimeout(function(){
                        mnuContext.$page = null;
                        mnuContext.tab   = null;
                    })
                }
            }

            mnuContext.on("prop.visible", removeContextInfo, false);
    
            menus.addItemByPath("Reveal in File Tree", new apf.item({
                command : "revealtab"
            }), 100, mnuContext, plugin);
            menus.addItemByPath("~", new apf.divider(), 200, mnuContext, plugin);
            menus.addItemByPath("Close Tab", new apf.item({
                command : "closetab"
            }), 300, mnuContext, plugin);
            menus.addItemByPath("Close All Tabs", new apf.item({
                command : "closealltabs"
            }), 400, mnuContext, plugin);
            menus.addItemByPath("Close All Tabs In Pane", new apf.item({
                command : "closepane"
            }), 450, mnuContext, plugin);
            menus.addItemByPath("Close Other Tabs", new apf.item({
                command : "closeallbutme"
            }), 500, mnuContext, plugin);
            menus.addItemByPath("~", new apf.divider(), 550, mnuContext, plugin);
            menus.addItemByPath("Close Tabs to the Right", new apf.item({
                command : "closealltotheright"
            }), 600, mnuContext, plugin);
            menus.addItemByPath("Close Tabs to the Left", new apf.item({
                command : "closealltotheleft"
            }), 700, mnuContext, plugin);
            menus.addItemByPath("~", new apf.divider(), 750, mnuContext, plugin);
            menus.addItemByPath("Split Pane Vertically", new apf.item({
                command : "vsplit"
            }), 800, mnuContext, plugin);
            menus.addItemByPath("Split Pane Horizontally", new apf.item({
                command : "hsplit"
            }), 900, mnuContext, plugin);
            
            mnuEditors = tabs.getElement("mnuEditors");
            var div, label;
            div   = menus.addItemToMenu(mnuEditors, new ui.divider(), 1000000, plugin);
            label = menus.addItemToMenu(mnuEditors, new ui.item({
                caption  : "Recently Closed Tabs",
                disabled : true
            }), 1000001, plugin);
            menuClosedItems.hide = function(){ div.hide(); label.hide(); }
            menuClosedItems.show = function(){ div.show(); label.show(); }
            menuClosedItems.hide();

            // Other Hooks
            tabs.on("tab.create", function(e){
                var tab = e.tab.aml;
                tab.on("contextmenu", function(e) {
                    if (!e.currentTarget) return;
                    mnuContext.$page = e.currentTarget.tagName == "page"
                        ? e.currentTarget.cloud9page : null;
                    mnuContext.$tab = e.currentTarget.tagName == "tab"
                        ? e.currentTarget.cloud9tab : null;
                });
                tab.setAttribute("contextmenu", mnuContext);
            })
    
            //@todo store the stack for availability after reload
            tabs.on("page.before.close", function(e) {
                var page  = e.page;
                var event = e.htmlEvent || {};
                
                // Shift = close all
                if (event.shiftKey) {
                    closealltabs();
                    return false;
                }
                // Alt/ Option = close all but this
                else if (event.altKey) {
                    closeallbutme(page);
                    return false;
                }
            });
            
            tabs.on("page.after.close", function(e) {
                // Hack to force focus on the right tab
                if (tabs.focussedPage == e.page && accessList[1])
                    e.page.tab.aml.nextTabInLine = accessList[1].aml;
            });
            
            tabs.on("page.reparent", function(e) {
                // Hack to force focus on the right tab
                if (tabs.focussedPage == e.page && accessList[1])
                    e.lastTab.aml.nextTabInLine = accessList[1].aml;
            });
            
            tabs.on("page.destroy", function(e) {
                var page = e.page;
                if (page.document.meta.preview)
                    return;
                    
                addPageToClosedMenu(page);
                accessList.remove(page);
                paneList.remove(page);
            });
            
            tabs.on("page.create", function(e){
                var page = e.page;

                if (page.title) {
                    // @todo candidate for optimization using a hash
                    for (var i = menuClosedItems.length - 1; i >= 0; i--) {
                        if (menuClosedItems[i].caption == page.title)
                            menuClosedItems.splice(i, 1)[0].destroy(true, true);
                    }
                }
                
                if (page.document.meta.preview)
                    return;

                if (accessList.indexOf(page) == -1) {
                    var idx = accessList.indexOf(page.name);
                    if (idx == -1) { //Load accesslist from index
                        if (page == tabs.focussedPage)
                            accessList.unshift(page);
                        else
                            accessList.push(page); //splice(1, 0, page);
                    }
                    else
                        accessList[idx] = page;
                }
                if (paneList.indexOf(page) == -1) {
                    var idx = paneList.indexOf(page.name);
                    if (idx == -1) { //Load paneList from index
                        if (page.isActive())
                            paneList.add(page);
                    }
                    else
                        paneList[idx] = page;
                }
            });
    
            tabs.on("focus", function(e){
                var page = e.page;

                if (!cycleKeyPressed) {
                    accessList.remove(page);
                    accessList.unshift(page);
                    accessList.changed = true;
                    
                    paneList.add(page, true);
                    paneList.changed = true;
                    
                    settings.save();
                }
    
                // @todo panel switch
                if (settings.get("user/panels/@active") == "tree" 
                  && settings.getBool('user/general/@revealfile')) {
                    revealtab(page, true);
                }
            });
            tabs.on("after.activate", function(e){
                var page = e.page;
                if (page == tabs.focussedPage) 
                    return;
            
                if (!cycleKeyPressed) {
                    accessList.remove(page);
                    accessList.splice(1, 0, page);
                    accessList.changed = true;
                    
                    paneList.add(page, 2);
                    paneList.changed = true;
                    
                    settings.save();
                }
            });
    
            apf.addEventListener("keydown", function(eInfo) {
                if (eInfo.keyCode == cycleKey) {
                    cycleKeyPressed = true;
                }
            });
    
            apf.addEventListener("keyup", function(eInfo) {
                if (eInfo.keyCode == cycleKey && cycleKeyPressed) {
                    cycleKeyPressed = false;
    
                    if (dirtyNextTab) {
                        accessedTab = 0;
    
                        var page = tabs.focussedPage;
                        if (accessList[accessedTab] != page) {
                            accessList.remove(page);
                            accessList.unshift(page);
    
                            accessList.changed = true;
                            settings.save();
                        }
    
                        dirtyNextTab = false;
                    }
                }
                if (eInfo.keyCode == paneCycleKey && cycleKeyPressed) {
                    cycleKeyPressed = false;
    
                    if (dirtyNextTab) {
                        accessedTab = 0;
    
                        var page = tabs.focussedPage;
                        if (paneList[accessedTab] != page) {
                            paneList.remove(page);
                            paneList.unshift(page);
    
                            paneList.changed = true;
                            settings.save();
                        }
    
                        dirtyNextTab = false;
                    }
                }
            });
    
            // tabs.addEventListener("aftersavedialogcancel", function(e) {
            //     if (!changedPages)
            //         return;
    
            //     var i, l, page;
            //     for (i = 0, l = changedPages.length; i < l; i++) {
            //         page = changedPages[i];
            //         page.removeEventListener("aftersavedialogclosed", arguments.callee);
            //     }
            // });
        }
        
        /***** Methods *****/
            
        function closetab(page) {
            if (!page)
                page = mnuContext.$page || tabs.focussedPage;
                
            var pages  = tabs.getPages();
            var isLast = pages[pages.length - 1] == page;
    
            page.close();
            tabs.resizeTabs(isLast);
    
            return false;
        }
    
        function closealltabs(callback) {
            callback = typeof callback == "function" ? callback : null;
    
            changedPages = [];
            unchangedPages = [];
    
            var pages = tabs.getPages();
            for (var i = 0, l = pages.length; i < l; i++) {
                closepage(pages[i], callback);
            }
    
            checkPageRender(callback);
        }
    
        function closeallbutme(ignore, pages, callback) {
            // if ignore isn't a page instance, then fallback to current page, 
            // unless it's an object from closealltotheright/left
            if (!ignore || ignore.type != "page") {
                if (typeof ignore === "undefined" 
                  || typeof ignore.closeall === "undefined") {
                    ignore = mnuContext.$page || tabs.focussedPage;
                }
            }
    
            changedPages   = [];
            unchangedPages = [];
    
            if (!pages)
                pages = tabs.getPages();
    
            var page;
            for (var i = 0, l = pages.length; i < l; i++) {
                page = pages[i];
    
                if (ignore && (page == ignore || ignore.hasOwnProperty(i)))
                    continue;
                else
                    closepage(page, callback);
            }
    
            tabs.resizeTabs();
            checkPageRender(callback);
        }
    
        function closepage(page, callback) {
            var doc = page.document;
            if (doc.changed && (!doc.meta.newfile || doc.value))
                changedPages.push(page);
            else
                unchangedPages.push(page);
        }
    
        function checkPageRender(callback) {
            save.saveAllInteractive(changedPages, function(result){
                if (result != save.CANCEL) {
                    changedPages.forEach(function(page){
                        page.unload();
                    })
                    closeUnchangedPages(function() {
                        if (callback)
                            callback();
                    });
                }
                else if (callback)
                    callback()
            });
        }
    
        function closeUnchangedPages(callback) {
            var page;
            for (var i = 0, l = unchangedPages.length; i < l; i++) {
                page = unchangedPages[i];
                page.close(true);
            }
    
            if (callback)
                callback();
        }
    
        function closealltotheright(page) {
            if (!page)
                page = mnuContext.$page || tabs.focussedPage;
                
            var pages   = page.tab.getPages();
            var currIdx = pages.indexOf(page);
            var ignore  = {};
    
            for (var j = 0; j <= currIdx; j++) {
                ignore[j] = page;
            }
    
            ignore.closeall = true;
            closeallbutme(ignore, pages);
        }
    
        function closealltotheleft(page) {
            if (!page)
                page = mnuContext.$page || tabs.focussedPage;
                
            var pages   = page.tab.getPages();
            var currIdx = pages.indexOf(page);
            var ignore  = {};
    
            for (var j = pages.length - 1; j >= currIdx; j--) {
                ignore[j] = page;
            }
    
            ignore.closeall = true;
            closeallbutme(ignore, pages);
        }
    
        function nexttab(){
            if (tabs.getPages().length === 1)
                return;
    
            if (++accessedTab >= accessList.length)
                accessedTab = 0;
    
            var next = accessList[accessedTab];
            if (typeof next != "object" || !next.tab.visible)
                return nexttab();
            tabs.focusPage(next, null, true);
    
            dirtyNextTab = true;
        }
    
        function previoustab (){
            if (tabs.getPages().length === 1)
                return;
    
            if (--accessedTab < 0)
                accessedTab = accessList.length - 1;
    
            var next = accessList[accessedTab];
            if (typeof next != "object" || !next.tab.visible)
                return previoustab();
            tabs.focusPage(next, null, true);
    
            dirtyNextTab = true;
        }
    
        function nextpane(){
            if (tabs.getTabs(tabs.container).length === 1)
                return;
    
            if (++accessedPane >= paneList.length)
                accessedPane = 0;
    
            var next = paneList[accessedPane];
            if (typeof next != "object" || !next.tab.visible)
                return nextpane();
            tabs.focusPage(next, null, true);
    
            dirtyNextTab = true;
        }
    
        function previouspane(){
            if (tabs.getPages(tabs.container).length === 1)
                return;
    
            if (--accessedPane < 0)
                accessedPane = paneList.length - 1;
    
            var next = paneList[accessedPane];
            if (typeof next != "object" || !next.tab.visible)
                return previouspane();
            tabs.focusPage(next, null, true);
    
            dirtyNextTab = true;
        }
    
        function gototabright(e) {
            return cycleTab("right");
        }
    
        function gototableft() {
            return cycleTab("left");
        }
    
        function cycleTab(dir) {
            var pages   = tabs.getPages();
            var curr    = tabs.focussedPage;
            var currIdx = pages.indexOf(curr);
            if (!curr || pages.length == 1)
                return;
    
            var start = currIdx;
            var page;
            
            do {
                var idx = currIdx;
                switch (dir) {
                    case "right": idx++; break;
                    case "left":  idx--; break;
                    case "first": idx = 0; break;
                    case "last":  idx = pages.length - 1; break;
                    default: idx--;
                }
        
                if (idx < 0)
                    idx = pages.length - 1;
                if (idx > pages.length - 1)
                    idx = 0;
                
                // No pages found that can be focussed
                if (start == idx)
                    return;
                
                page = pages[idx];
            } 
            while (!page.tab.visible);
    
            if (page.tab.visible)
                tabs.focusPage(page, null, true);
            
            return false;
        }
    
        function movetabright() { hmoveTab("right"); }
        function movetableft() { hmoveTab("left"); }
        function movetabup() { vmoveTab("up"); }
        function movetabdown() { vmoveTab("down"); }
    
        function hmoveTab(dir) {
            var bRight  = dir == "right";
            var page    = tabs.focussedPage;
            if (!page)
                return;
            
            // Pages within the current tab
            var pages   = page.tab.getPages();
            
            // Get new index
            var idx = pages.indexOf(page) + (bRight ? 2 : -1);
            
            // Before current tab
            if (idx < 0 || idx > pages.length) {
                var dt = new Date();
                page.tab.movePageToSplit(page, dir);
            }
            // In current tab
            else {
                page.attachTo(page.tab, pages[idx], null, true);
            }

            return false;
        }
        
        function vmoveTab(dir) {
            var page = tabs.focussedPage;
            if (!page)
                return;
            
            page.tab.movePageToSplit(page, dir);
            return false;
        }
    
        function tab1() { return showTab(1); }
        function tab2() { return showTab(2); }
        function tab3() { return showTab(3); }
        function tab4() { return showTab(4); }
        function tab5() { return showTab(5); }
        function tab6() { return showTab(6); }
        function tab7() { return showTab(7); }
        function tab8() { return showTab(8); }
        function tab9() { return showTab(9); }
        function tab0() { return showTab(10); }
    
        function showTab(idx) {
            // our indexes are 0 based an the number coming in is 1 based
            var page = (menuItems[idx] || false).relPage;
            if (!page)
                return false;
    
            tabs.focusPage(page, null, true);
            return false;
        }
    
        /**
         * Scrolls to the selected tab's file path in the "Project Files" tree
         *
         * Works by Finding the node related to the active tab in the tree, and
         * unfolds its parent folders until the node can be reached by an xpath
         * selector and focused, to finally scroll to the selected node.
         */
        function revealtab(page, noFocus) {
            if (!page || page.command)
                page = tabs.focussedPage;
            if (!page)
                return false;
    
            // Tell other extensions to exit their fullscreen mode (for ex. Zen)
            // so this operation is visible
            // ide.dispatchEvent("exitfullscreen");
    
            revealInTree(page, noFocus);
        }
    
        function revealInTree (page, noFocus) {
            panels.activate("tree");
    
            tree.expand(page.path, function(err){
                var path = err ? "/" : page.path;
                tree.select(path);
                tree.scrollToSelection();
            });
            if (!noFocus)
                tree.focus();
        }
        
        function canTabBeRemoved(tab, min){
            if (!tab || tab.getPages().length > (min || 0)) 
                return false;
            
            var containers = tabs.containers;
            for (var i = 0; i < containers.length; i++) {
                if (ui.isChildOf(containers[i], tab.aml)) {
                    return containers[i]
                        .getElementsByTagNameNS(apf.ns.aml, "tab").length > 1
                }
            }
            return false;
        }
        
        function closepane(page, tab){
            if (!tab)
                tab = page.tab;
                
            var pages = tab.getPages();
            if (!pages.length) {
                if (canTabBeRemoved(tab))
                    tab.unload();
                return;
            }
            
            changedPages   = [];
            unchangedPages = [];
            
            // Ignore closing tabs
            menuClosedItems.ignore = true;
    
            // Keep information to restore tab set
            var state = [];
            var type  = tab.aml.parentNode.localName;
            var nodes = tab.aml.parentNode.childNodes.filter(function(p){ 
                return p.localName != "splitter";
            });
            
            state.title    = pages.length + " Tabs";
            state.type     = type == "vsplitbox" ? "vsplit" : "hsplit";
            state.far      = nodes.indexOf(tab.aml) == 1;
            state.sibling  = nodes[state.far ? 0 : 1];
            state.getState = function(){ return state };
            state.restore  = function(state){ 
                var tab     = state.sibling;
                if (tab && tab.clou9tab) 
                    tab = tab.cloud9tab.aml;
                var newtab  = state.tab[state.type](state.far, null, tab);
                
                state.forEach(function(s){
                    s.tab = newtab;
                    tabs.open(s, function(){});
                });
            };
            state.document = { meta: {} };
            
            // Close pages
            pages.forEach(function(page){ 
                state.push(page.getState());
                closepage(page); 
            });
            
            tabs.resizeTabs();
            checkPageRender(function(){
                if (canTabBeRemoved(tab))
                    tab.unload();
                    
                // Stop ignoring closing tabs
                menuClosedItems.ignore = false;
                
                // @todo there should probably be some check here
                addPageToClosedMenu(state);
            });
        }
        
        function hsplit(page){
            if (!page)
                page = tabs.focussedPage;
            
            var newtab = page.tab.hsplit(true);
            if (page.tab.getPages().length > 1)
                page.attachTo(newtab);
        }
        
        function vsplit(page){
            if (!page)
                page = tabs.focussedPage;
            
            var newtab = page.tab.vsplit(true);
            if (page.tab.getPages().length > 1)
                page.attachTo(newtab);
        }
        
        function nosplit(){
            var panes = tabs.getTabs(tabs.container);
            var first = panes[0];
            for (var pane, i = 1, li = panes.length; i < li; i++) {
                var pages = (pane = panes[i]).getPages();
                for (var j = 0, lj = pages.length; j < lj; j++) {
                    pages[j].attachTo(first, null, true);
                }
                pane.unload();
            }
        }
        
        function twovsplit(hsplit){
            var panes = tabs.getTabs(tabs.container);
            
            // We're already in a two vsplit
            if (panes.length == 2 && panes[0].aml.parentNode.localName 
              == (hsplit ? "hsplitbox" : "vsplitbox"))
                return panes;
            
            // Split the only pane there is
            if (panes.length == 1) {
                var newtab = panes[0][hsplit ? "hsplit" : "vsplit"](true);
                return [panes[0], newtab];
            }
            
            var c = tabs.containers[0].firstChild.childNodes.filter(function(f){
                return f.localName != "splitter";
            });
            // var left  = c[0].getElementsByTagNameNS(apf.ns.aml, "page");
            var right = c[1].getElementsByTagNameNS(apf.ns.aml, "page");
            
            for (var i = 1, l = panes.length; i < l; i++) {
                panes[i].unload();
            }
            
            var newtab = panes[0][hsplit ? "hsplit" : "vsplit"](true);
            right.forEach(function(page){
                if (page.cloud9page)
                    page.cloud9page.attachTo(newtab, null, true);
            });
            
            return [panes[0], newtab];
        }
        
        function twohsplit(){
            return twovsplit(true)
        }
        
        function foursplit(){
            var panes = twohsplit();
            panes[0].vsplit(true);
            panes[1].vsplit(true);
        }
        
        function threeleft(){
            var panes = twohsplit();
            panes[0].vsplit(true);
        }
        
        function threeright(){
            var panes = twohsplit();
            panes[1].vsplit(true);
        }
        
        // Record the last 10 closed tabs or tab sets
        function addPageToClosedMenu(page){
            if (menuClosedItems.ignore) return;
            
            if (page.document.meta.preview)
                return;
            
            // Record state
            var state = page.getState();
            
            if (!page.restore) {
                for (var i = menuClosedItems.length - 1; i >= 0; i--) {
                    if (menuClosedItems[i].caption == page.title) {
                        menuClosedItems.splice(i, 1)[0].destroy(true, true);
                    }
                }
            }
            
            // Create menu item
            var item  = new ui.item({
                caption : page.title,
                style   : "padding-left:35px",
                onclick : function(e){
                    // Update State
                    state.active = true;
                    state.tab    = this.parentNode.tab;
                    
                    // Open tab
                    page.restore
                        ? page.restore(state)
                        : tabs.open(state, function(){});
                    
                    // Remove tab from menu
                    menuClosedItems.remove(item);
                    item.destroy(true, true);
                    
                    // Clear label and divider if there are no items
                    if (menuClosedItems.length == 0)
                        menuClosedItems.hide();
                }
            });
            
            // Add item to menu
            menuClosedItems.push(item);
            var index = menuClosedItems.index = (menuClosedItems.index || 0) + 1;
            menus.addItemToMenu(mnuEditors, item, 2000000 - index, false);
            
            // Show label and divider
            menuClosedItems.show();
            
            // Remove excess menu item
            if (menuClosedItems.length > 10)
                menuClosedItems.shift().destroy(true, true);
        }
    
        function updateTabMenu(force) {
            // Approximating order
            var pages = [];
            tabs.getTabs().forEach(function(tab){
                pages = pages.concat(tab.getPages());
            });
            var length = Math.min(10, pages.length);
            var start = 1000;
            
            // Destroy all items
            menuItems.forEach(function(item){
                item.destroy(true, true);
            });
            menuItems = [];
            
            if (!pages.length)
                return;
            
            var mnu, page;
            
            // Create new divider
            menus.addItemToMenu(mnuTabs, mnu = new apf.divider(), start, false);
            menuItems.push(mnu);
            
            // Create new items
            var onclick = function() { tabs.focusPage(page, null, true); };
            for (var i = 0; i < length; i++) {
                page = pages[i];
                if (!page.title) continue;
                menus.addItemToMenu(mnuTabs, mnu = new apf.item({
                    caption : page.title,
                    relPage : page,
                    command : "tab" + (i == 9 ? 0 : i + 1),
                    onclick : onclick
                }), start + i + 1, false);
                menuItems.push(mnu);
            }
            
            if (pages.length > length) {
                menus.addItemToMenu(mnuTabs, mnu = new apf.item({
                    caption : "More...",
                    onclick : function() {
                        panels.activate("openfiles");
                    }
                }), start + length + 1, false);
                menuItems.push(mnu);
            }
        }
    
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("unload", function(){
            menuItems.forEach(function(item){
                item.destroy(true, true);
            });
            menuItems = [];
            menuClosedItems.forEach(function(item){
                item.destroy(true, true);
            });
            menuClosedItems = [];
            
            loaded = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * Draws the file tree
         * @event afterfilesave Fires after a file is saved
         *   object:
         *     node     {XMLNode} description
         *     oldpath  {String} description
         **/
        plugin.freezePublicAPI({
            /**
             * 
             */
            closetab : closetab,
            
            /**
             * 
             */
            closealltabs : closealltabs,
            
            /**
             * 
             */
            closeallbutme : closeallbutme,
            
            /**
             * 
             */
            gototabright : gototabright,
            
            /**
             * 
             */
            gototableft : gototableft,
            
            /**
             * 
             */
            movetabright : movetabright,
            
            /**
             * 
             */
            movetableft : movetableft,
            
            /**
             * 
             */
            movetabup : movetabup,
            
            /**
             * 
             */
            movetabdown : movetabdown,
            
            /**
             * 
             */
            tab1 : tab1,
            
            /**
             * 
             */
            tab2 : tab2,
            
            /**
             * 
             */
            tab3 : tab3,
            
            /**
             * 
             */
            tab4 : tab4,
            
            /**
             * 
             */
            tab5 : tab5,
            
            /**
             * 
             */
            tab6 : tab6,
            
            /**
             * 
             */
            tab7 : tab7,
            
            /**
             * 
             */
            tab8 : tab8,
            
            /**
             * 
             */
            tab9 : tab9,
            
            /**
             * 
             */
            tab0 : tab0,
            
            /**
             * 
             */
            revealtab : revealtab,
            
            /**
             * 
             */
            nexttab : nexttab,
            
            /**
             * 
             */
            previoustab : previoustab,
            
            /**
             * 
             */
            closealltotheright : closealltotheright,
            
            /**
             * 
             */
            closealltotheleft : closealltotheleft,
            
            /**
             * 
             */
            closepane : closepane,
            
            /**
             * 
             */
            hsplit : hsplit,
            
            /**
             * 
             */
            vsplit : vsplit,
            
            /**
             * 
             */
            nosplit : nosplit,
            
            /**
             * 
             */
            twovsplit : twovsplit,
            
            /**
             * 
             */
            twohsplit : twohsplit,
            
            /**
             * 
             */
            foursplit : foursplit,
            
            /**
             * 
             */
            threeleft : threeleft,
            
            /**
             * 
             */
            threeright : threeright,
            
            /**
             * 
             */
            nextpane : nextpane,
            
            /**
             * 
             */
            previouspane : previouspane
        });
        
        register(null, {
            tabbehavior: plugin
        });
    }
});
