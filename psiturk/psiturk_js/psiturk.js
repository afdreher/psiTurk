/*
 * Requires:
 *     jquery
 *     backbone
 *     underscore
 */


/****************
 * Internals    *
 ***************/

// Sets up global notifications pub/sub
// Notifications get submitted here (via trigger) and subscribed to (via on)
Backbone.Notifications = {};
_.extend(Backbone.Notifications, Backbone.Events);


/*******
 * API *
 ******/
var PsiTurk = function (uniqueId, adServerLoc, mode) {
	mode = mode || "live";  // defaults to live mode in case user doesn't pass this
	var self = this;

	/****************
	 * TASK DATA    *
	 ***************/
	var TaskData = Backbone.Model.extend({
		urlRoot: "/sync", // Fetch will GET from this url, while Save will PUT to this url, with mimetype 'application/JSON'
		adServerLoc: adServerLoc,
		mode: mode,

		defaults: {
			condition: 0,
			counterbalance: 0,
			assignmentId: 0,
			workerId: 0,
			hitId: 0,
			currenttrial: 0,
			bonus: 0,
			data: [],
			questiondata: {},
			eventdata: [],
			useragent: "",
			mode: ""
		},

		initialize: function () {
			this.set({ useragent: navigator.userAgent });
			this.set({ mode: this.mode });
			this.addEvent('initialized', null);
			this.addEvent('window_resize', [window.innerWidth, window.innerHeight]);

			this.listenTo(Backbone.Notifications, '_psiturk_lostfocus', function () { this.addEvent('focus', 'off'); });
			this.listenTo(Backbone.Notifications, '_psiturk_gainedfocus', function () { this.addEvent('focus', 'on'); });
			this.listenTo(Backbone.Notifications, '_psiturk_windowresize', function (newsize) { this.addEvent('window_resize', newsize); });
		},

		addTrialData: function (trialdata) {
			trialdata = { "uniqueid": this.id, "current_trial": this.get("currenttrial"), "dateTime": (new Date().getTime()), "trialdata": trialdata };
			var data = this.get('data');
			data.push(trialdata);
			this.set('data', data);
			this.set({ "currenttrial": this.get("currenttrial") + 1 });
		},

		addUnstructuredData: function (field, response) {
			var qd = this.get("questiondata");
			qd[field] = response;
			this.set("questiondata", qd);
		},

		getTrialData: function () {
			return this.get('data');
		},

		getEventData: function () {
			return this.get('eventdata');
		},

		getQuestionData: function () {
			return this.get('questiondata');
		},

		addEvent: function (eventtype, value) {
			var interval,
				ed = this.get('eventdata'),
				timestamp = new Date().getTime();

			if (eventtype == 'initialized') {
				interval = 0;
			} else {
				interval = timestamp - ed[ed.length - 1]['timestamp'];
			}

			ed.push({ 'eventtype': eventtype, 'value': value, 'timestamp': timestamp, 'interval': interval });
			this.set('eventdata', ed);
		}
	});


	/*****************************************************
	* INSTRUCTIONS 
	*   - a simple, default instruction player
	******************************************************/
	var Instructions = function (parent, pages, callback) {

		var self = this;
		var psiturk = parent;
		var currentscreen = 0, timestamp;
		var instruction_pages = pages;
		var complete_fn = callback;

		var loadPage = function () {

			// show the page
			psiturk.showPage(instruction_pages[currentscreen]);

			// connect event handler to previous button
			if (currentscreen != 0) {  // can't do this if first page
				$('.instructionsnav').on('click.psiturk.instructionsnav.prev', '.previous', function () {
					prevPageButtonPress();
				});
			}

			// connect event handler to continue button
			$('.instructionsnav').on('click.psiturk.instructionsnav.next', '.continue', function () {
				nextPageButtonPress();
			});

			// Record the time that an instructions page is first presented
			timestamp = new Date().getTime();

		};
		var prevPageButtonPress = function () {

			// Record the response time
			var rt = (new Date().getTime()) - timestamp;
			viewedscreen = currentscreen;
			currentscreen = currentscreen - 1;
			if (currentscreen < 0) {
				currentscreen = 0; // can't go back that far
			} else {
				psiturk.recordTrialData({ "phase": "INSTRUCTIONS", "template": pages[viewedscreen], "indexOf": viewedscreen, "action": "PrevPage", "viewTime": rt });
				loadPage();
			}

		}

		var nextPageButtonPress = function () {

			// Record the response time
			var rt = (new Date().getTime()) - timestamp;
			viewedscreen = currentscreen;
			currentscreen = currentscreen + 1;

			if (currentscreen == instruction_pages.length) {
				psiturk.recordTrialData({ "phase": "INSTRUCTIONS", "template": pages[viewedscreen], "indexOf": viewedscreen, "action": "FinishInstructions", "viewTime": rt });
				finish();
			} else {
				psiturk.recordTrialData({ "phase": "INSTRUCTIONS", "template": pages[viewedscreen], "indexOf": viewedscreen, "action": "NextPage", "viewTime": rt });
				loadPage();
			}

		};

		var finish = function () {

			// unbind all instruction related events
			$('.continue').unbind('click.psiturk.instructionsnav.next');
			$('.previous').unbind('click.psiturk.instructionsnav.prev');

			// Record that the user has finished the instructions and 
			// moved on to the experiment. This changes their status code
			// in the database.
			psiturk.finishInstructions();

			// Move on to the experiment 
			complete_fn();
		};



		/* public interface */
		self.getIndicator = function () {
			return { "currently_viewing": { "indexOf": currentscreen, "template": pages[currentscreen] }, "instruction_deck": { "total_pages": instruction_pages.length, "templates": instruction_pages } };
		}

		self.loadFirstPage = function () { loadPage(); }

		// log instruction are starting
		psiturk.recordTrialData({ "phase": "INSTRUCTIONS", "templates": pages, "action": "Begin" });

		return self;
	};

	self.doBlockBasedExperiment = function (options, ...blocks) {
		self.createBlockManager();
		if (options) {
			self.blockManager.onComplete = options.onComplete;
		}

		// Add each block to the manager
		blocks.forEach(block => self.addBlock(block));

		self.blockManager.start();
	}
	
	self.createBlockManager = function () {
		if (!self.blockManager) {
			self.blockManager = new BlockManager(self);
		}
	}

	self.addBlock = function(block) {
		self.createBlockManager();
		self.blockManager.add(block);
	}

	self.createBlock = function (name, instructions, experiment_fn) {
		return new ExperimentBlock(self, name, instructions, experiment_fn);
	}

	self.isBlockBased = function() {
		return !!self.blockManager; // Does a manager exist?
	};

	/*  PUBLIC METHODS: */
	self.preloadImages = function (imagenames) {
		$(imagenames).each(function () {
			image = new Image();
			image.src = this;
		});
	};

	self.preloadPages = function (pagenames) {
		// asynchronously preload pages. 
		return Promise.all($.map(pagenames, (pagename) => {
			return $.ajax({
				url: pagename,
				dataType: "html",
			}).then((page_html) => {
				self.pages[pagename] = page_html
			})
		}));
	};

	// Get HTML file from collection and pass on to a callback
	self.getPage = function (pagename) {
		if (!(pagename in self.pages)) {
			throw new Error(
				["Attemping to load page before preloading: ",
					pagename].join(""));
		};
		return self.pages[pagename];
	};


	// Add a line of data with any number of columns
	self.recordTrialData = function (trialdata) {
		taskdata.addTrialData(trialdata);
	};

	// Add data value for a named column. If a value already
	// exists for that column, it will be overwritten
	self.recordUnstructuredData = function (field, value) {
		taskdata.addUnstructuredData(field, value);
	};

	self.getTrialData = function () {
		return taskdata.getTrialData();
	};

	self.getEventData = function () {
		return taskdata.getEventData();
	};

	self.getQuestionData = function () {
		return taskdata.getQuestionData();
	};

	// Add bonus to task data
	self.computeBonus = function (url, callback) {
		$.ajax(url, {
			type: "GET",
			data: { uniqueId: self.taskdata.id },
			success: callback
		});
	};

	// Save data to server
	self.saveData = function (callbacks) {
		taskdata.save(undefined, callbacks);
	};

	self.startTask = function () {
		self.saveData();

		$.ajax("inexp", {
			type: "POST",
			data: { uniqueId: self.taskdata.id }
		});

		if (self.taskdata.mode != 'debug') {  // don't block people from reloading in debug mode
			// Provide opt-out 
			$(window).on("beforeunload", function () {
				self.saveData();

				$.ajax("quitter", {
					type: "POST",
					data: { uniqueId: self.taskdata.id }
				});
				//var optoutmessage = "By leaving this page, you opt out of the experiment.";
				//alert(optoutmessage);
				return "By leaving or reloading this page, you opt out of the experiment.  Are you sure you want to leave the experiment?";
			});
		}

	};

	self.startBlocks = function () {
		self.saveData();

		$.ajax("startblocks", {
			type: "POST",
			data: { uniqueId: self.taskdata.id }
		});

		if (self.taskdata.mode != 'debug') {  // don't block people from reloading in debug mode
			// Provide opt-out 
			$(window).on("beforeunload", function () {
				self.saveData();

				$.ajax("quitter", {
					type: "POST",
					data: { uniqueId: self.taskdata.id }
				});
				return "By leaving or reloading this page, you opt out of the experiment.  Are you sure you want to leave the experiment?";
			});
		}
	}

	self.startBlockTask = function () {
		self.saveData();

		$.ajax("inblock", {
			type: "POST",
			data: { 
				uniqueId: self.taskdata.id,
				blockId: self.blockManager.currentBlock().name,
			 }
		});
	};

	self.finishBlock = function () {
		self.saveData();

		$.ajax("endblock", {
			type: "POST",
			data: { 
				uniqueId: self.taskdata.id,
				blockId: self.blockManager.currentBlock().name,
			 }
		});

		if(self.blockManager.hasMore()) {
			self.blockManager.next();
		} else {
			console.log('Done with experiment.  Run onComplete, if provided.');
			self.blockManager.finish();
		}
	};

	// Notify app that participant has begun main experiment
	self.finishInstructions = function (optmessage) {
		if (self.isBlockBased) {
			Backbone.Notifications.trigger('_psiturk_finishedblockinstructions', optmessage);
		} else {
			Backbone.Notifications.trigger('_psiturk_finishedinstructions', optmessage);
		}
	};

	self.teardownTask = function (optmessage) {
		Backbone.Notifications.trigger('_psiturk_finishedtask', optmessage);
	};

	self.completeHIT = function () {
		self.teardownTask();
		// save data one last time here?
		window.location = self.taskdata.adServerLoc + "?uniqueId=" + self.taskdata.id + "&mode=" + self.taskdata.mode;
	}

	self.doInstructions = function (pages, callback) {
		instructionController = new Instructions(self, pages, callback);
		instructionController.loadFirstPage();
	};

	self.getInstructionIndicator = function () {
		if (instructionController != undefined) {
			return instructionController.getIndicator();
		}
	}

	// To be fleshed out with backbone views in the future.
	var replaceBody = function (x) { $('body').html(x); };

	self.showPage = _.compose(replaceBody, self.getPage);

	/* initialized local variables */

	var taskdata = new TaskData({ 'id': uniqueId });
	taskdata.fetch({ async: false });

	/*  DATA: */
	self.blockManager = null; // Does not currently exist

	self.pages = {};
	self.taskdata = taskdata;


	/* Backbone stuff */
	Backbone.Notifications.on('_psiturk_finishedinstructions', self.startTask);
	Backbone.Notifications.on('_psiturk_finishedtask', function (msg) { $(window).off("beforeunload"); });
	Backbone.Notifications.on('_psiturk_finishedblockinstructions', self.startBlockTask);
	Backbone.Notifications.on('_psiturk_finishedblockexperiment', self.startBlockTask);


	$(window).blur(function () {
		Backbone.Notifications.trigger('_psiturk_lostfocus');
	});

	$(window).focus(function () {
		Backbone.Notifications.trigger('_psiturk_gainedfocus');
	});

	// track changes in window size
	var triggerResize = function () {
		Backbone.Notifications.trigger('_psiturk_windowresize', [window.innerWidth, window.innerHeight]);
	};

	// set up the window resize trigger
	var to = false;
	$(window).resize(function () {
		if (to !== false)
			clearTimeout(to);
		to = setTimeout(triggerResize, 200);
	});

	return self;
};

/**
 * I don't like mixing too many variables into the psiturk object.  I'm going to
 * isolate the blocks using a block manager.
 * 
 * Blocks should be added to the block manager using add(...)
 * Call start() to begin the experiments.
 */
class BlockManager {

	constructor(psiturk) {
		this.psiturk = psiturk;
		this.blocks = [];
		this.currentBlockIndex = 0;
	}

	add(block) {
		this.blocks.push(block);
	}

	currentBlock () {
		return this.blocks[this.currentBlockIndex];
	}

	start() {
		this.psiturk.startBlocks();
		this.currentBlockIndex = 0;
		this.currentBlock().start();
	}

	hasMore() {
		return (this.currentBlockIndex < (this.blocks.length - 1));
	}

	next() {
		if (this.hasMore()) {
			this.currentBlockIndex++;
			this.currentBlock().start();
		} else {
			this.finish();
		}
	}

	finish() {
		if (this.onComplete) {
			this.onComplete();
		}
	}

};

/**
 * Create a block...
 * 
 * I'm going to use E6S classes because I don't really understand how to do
 * this propertly in ES5 era JS.
 * 
 * WARNING! Make sure you capture the necessary scope with experiment_fn!
 */
class ExperimentBlock {

	constructor(psiturk, name, instructions, experiment_fn) {
		this.psiturk = psiturk;
		this.name = name;
		this.instructions = instructions;
		this.experiment = experiment_fn;
	}

	async start() {
		// Show instructions if any exist, otherwise jumpt to the experiment
		if (this.instructions) {
			this.showInstructions();
		} else {
			this.runExperiment();
		}
	}

	async showInstructions() {
		// Check to see if the pages are loaded.  If not, load them.
		if (_.difference(this.instructions, Object.keys(this.psiturk.pages)) != 0) {
			await this.psiturk.preloadPages(this.instructions);
		}

		// CAUTION! You have to bind 'this'!
		let callabck = function() {  this.runExperiment(); }.bind(this);
		this.psiturk.doInstructions(this.instructions, callabck);
	}

	runExperiment() {
		this.experiment();
	}

};