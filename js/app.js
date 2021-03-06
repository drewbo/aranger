/**
 * Main aRanger app JS.
 *
 * Example inspired by:
 * http://www.washingtonpost.com/wp-srv/special/business/states-most-threatened-by-trade/
 *
 * Github Oauth with:
 * https://github.com/prose/gatekeeper#oauth-steps
 *
 * This code is not model code; get over it.
 */

(function() {
  var exampleItems = [
    [0,0,"AK"],[12,0,"ME"],[7,1,"WI"],[11,1,"VT"],[12,1,"NH"],[2,2,"WA"],
    [3,2,"ID"],[4,2,"MT"],[5,2,"ND"],[6,2,"MN"],[7,2,"IL"],[8,2,"MI"],
    [10,2,"NY"],[11,2,"MA"],[2,3,"OR"],[3,3,"NV"],[4,3,"WY"],[5,3,"SD"],
    [6,3,"IA"],[7,3,"IN"],[8,3,"OH"],[9,3,"PA"],[10,3,"NJ"],[11,3,"CT"],
    [12,3,"RI"],[2,4,"CA"],[3,4,"UT"],[4,4,"CO"],[5,4,"NE"],[6,4,"MO"],
    [7,4,"KY"],[8,4,"WV"],[9,4,"VA"],[10,4,"MD"],[11,4,"DE"],[3,5,"AZ"],
    [4,5,"NM"],[5,5,"KS"],[6,5,"AR"],[7,5,"TN"],[8,5,"NC"],[9,5,"SC"],
    [10,5,"DC"],[5,6,"OK"],[6,6,"LA"],[7,6,"MS"],[8,6,"AL"],[9,6,"GA"],
    [5,7,"TX"],[10,7,"FL"],[1,8,"AS"],[2,8,"HI"],[11,9,"VI"],[12,9,"PR"]
  ];
  var template = document.getElementById('main-template-container').innerHTML;
  var rows = 20;
  var columns = 30;
  var cells = rows * columns;
  var cellSize = 30;
  var db = localStorage;
  var isLocal = !!window.location.href.match(/localhost:8080/);
  var githubClient = (isLocal) ? '3815fdccb55b02f58aa7' : '04f0f4d8b3ade6000d8d';
  var githubGatekeeper = (isLocal) ? 'http://mp-aranger-gk-local.herokuapp.com/' : 'http://mp-aranger-gatekeeper.herokuapp.com/';
  var githubAuthorize = 'https://github.com/login/oauth/authorize?client_id=' +
    githubClient + '&scope=gist,repo';
  var View, r;




  // Make ractive view handler which will hold most of our methods
  View = Ractive.extend({
    el: '#main-template-view',
    template: template,

    init: function() {
      var thisView = this;

      // Check for auth
      this.loadAuthCode();
      this.loadUser();

      // Load data from storage or example
      this.initialLoad();

      // Observations
      this.observe({
        gist: function(n, o) {
          var path = this.urlGet();
          var userData = this.get('user');

          if (n && n !== o) {
            this.urlSet(path.hash(n));
            // Note if current gist is owned by logged in person
            this.set('notOwnGist', (_.isObject(userData)) ?
              this.get('gistOwner') !== userData.login : true);
          }
        },

        // If items change through the interface, then update data
        // structure
        arrangementString: function(n, o) {
          var p;

          if (_.isString(n) && n.length > 0) {
            // Wrap so that incomplete input will be ok
            try {
              JSON.parse(n);
            }
            catch (e) {
              return false;
            }

            p = JSON.parse(n);
            p = this.standardizeArrangement(p);
            this.set('arrangement', p);
          }
        },

        // If actual data changes
        arrangement: function(n, o) {
          if (_.isArray(n) && n.length > 0 && !_.isEqual(n, o)) {
            n = this.standardizeArrangement(n);
            this.set('cellsArray', this.arrangementToCells(n));
            this.set('arrangementString', JSON.stringify(n));
            this.storageSave();
          }
        },

        // If cells array changes, update items
        cellsArray: function(n, o) {
          if (_.isArray(n) && n.length > 0) {
            this.set('arrangement', this.cellsToArrangement(n));
          }
        },

        // Columns change
        columns: function(n, o) {
          var min = this.get('minColumns');

          if (n && n != o) {
            if (n <= min + 2) {
              n = min + 2;
            }
            // Ensure its a whole number
            this.set('columns', parseInt(n, 10));
            // Update arrangement
            this.set('cellsArray', this.arrangementToCells(this.get('arrangement')));
          }
        },

        // Row change
        rows: function(n, o) {
          var min = this.get('minRows');

          if (n && n != o) {
            if (n <= min + 2) {
              n = min + 2;
            }
            // Ensure its a whole number
            this.set('rows', parseInt(n, 10));
            // Update arrangement
            this.set('cellsArray', this.arrangementToCells(this.get('arrangement')));
          }
        }
      });

      // Events.  Drag 'c' is cell event, and 'i' is for item event
      this.on({
        // Save to gist
        actionSaveGist: function(e, saveNew) {
          e.original.preventDefault();
          this.saveGist(saveNew);
        },

        // Login
        actionLogin: function(e) {
          e.original.preventDefault();
          if (this.isLoggedIn()) {
            this.authLogout();
          }
          else {
            window.location.href = githubAuthorize;
          }
        },

        // Perform undo
        undoAction: function(e) {
          e.original.preventDefault();

          var undone = this.undo();
          if (undone) {
            this.set('arrangement', undone);
          }
        },

        // Reset storage
        actionStorageReset: function(e) {
          e.original.preventDefault();

          if (window.confirm('Are you sure you want to remove all changes ever made to this and other arrangements?  You cannot undo this.')) {
            this.storageReset();
            this.initialLoad();
          }
        },

        // Reset storage
        actionResetArrangement: function(e) {
          e.original.preventDefault();
          var a;

          if (window.confirm('Are you sure you want to remove all arranagement?')) {
            a = this.get('arrangement');
            a = _.map(a, function(i, ii) {
              return i[2];
            });
            this.set('arrangementString', JSON.stringify(a));
          }
        },

        // Start dragging an item
        idragstart: function(e) {
          var i = parseInt(e.node.getAttribute('data-index'), 10);
          var value = this.get('cellsArray.' + i);

          // Firefox really wants some data hooked onto
          // the drag
          var dt = e.original.dataTransfer;
          dt.setData('ff', 'data');

          // Visually mark
          e.node.classList.add('dragging');
          // Attach data to dragging placeholder
          this.set('dragging', [i, value]);
        },

        // When done dragging and not dropped on a valid place
        idragend: function(e) {
          // Visually mark
          e.node.classList.remove('dragging');
          // Reset data
          this.set('dragging', undefined);
        },

        // Currently dragging over a draggable place
        cdragover: function(e) {
          // This is necessary so that a drop can happen
          e.original.preventDefault();
        },

        // Entering a draggable place
        cdragenter: function(e) {
          // Visually mark
          e.node.classList.add('dragover');
        },

        // Leave draggable place
        cdragleave: function(e) {
          // Visually mark
          e.node.classList.remove('dragover');
        },

        cdrop: function(e) {
          var p = this.get('dragging');
          var n = parseInt(e.node.getAttribute('data-index'));
          var same = (p[0] === n);
          var existing = !_.isUndefined(this.get('cellsArray.' + n))
          var cells = _.clone(this.get('cellsArray'));

          // Visually mark
          e.node.classList.remove('dragover');
          // Successful move
          if (!same) {
            if (existing) {
              this.insertItem([n, this.get('cellsArray.' + n)], p);
            }
            else {
              cells[n] = p[1];
              cells[p[0]] = undefined;
              this.set('cellsArray', cells);
            }
          }
          // Done clear data
          this.set('dragging', undefined);
        }
      });
    },

    // Computed properties
    computed: {
      minColumns: function() {
        return _.max(this.get('arrangement'), function(d, di) {
          return d[0];
        })[0];
      },
      minRows: function() {
        return _.max(this.get('arrangement'), function(d, di) {
          return d[1];
        })[1];
      }
    },

    // Load Gist
    loadGist: function() {
      var thisView = this;
      var path = window.location.href;
      var id = (path.match(/#(.*)$/)) ? path.match(/#(.*)$/)[1] : false;
      var gist;

      if (id) {
        gist = this.githubAPI.getGist(id);
        this.set('gistLoading', true);
        gist.read(function(error, data) {
          if (error) {
            // Handle error
          }
          else {
            if (_.isObject(data.files) && 'aranger.json' in data.files) {
              thisView.set('arrangementString', data.files['aranger.json'].content);
              thisView.set('gistOwner', data.owner.login);
              thisView.set('gist', id);
            }
            else {
              // Gist loaded but no aranger file
            }
          }
          thisView.set('gistLoading', false);
        });

        return true;
      }
      return false;
    },

    // Save to gist
    saveGist: function(saveNew) {
      var thisView = this;
      var newGist = (saveNew === true) ? true : ((this.get('gist')) ? false : true);
      var id = (newGist) ? 'new' : this.get('gist');
      var method = (newGist) ? 'create' : 'update';
      var gistData = {
        'description': 'An aRanger arrangment.',
        'public': true,
        'files': {
          'aranger.json': {
            'content': this.get('arrangementString')
          },
          'README.md': {
            'content': 'An arrangement of items made through [aRanger](http://code.minnpost.com/aranger/).'
          }
        }
      };
      var gist = new Github.Gist({ id: id });

      thisView.set('gistLoading', true);
      gist[method](gistData, function(error, data) {
        if (error) {
          // Handle error
        }
        else {
          thisView.set('gistOwner', thisView.dbGet('auth-user').login);
          thisView.set('gist', data.id);
        }
        thisView.set('gistLoading', false);
      });
    },

    // Authentication steps
    loadAuthCode: function() {
      var thisView = this;
      var path = this.urlGet();
      var code = (_.isObject(path.search(true)) && path.search(true).code) ?
        path.search(true).code : undefined;

      if (code) {
        this.set('authLoading', true);
        $.ajax({
          url:  githubGatekeeper + 'authenticate/' + code
        })
          .done(function(data) {
            if (data.token) {
              thisView.dbSet('auth-token', data.token);

              // Get basic user info from Github
              $.ajax({
                url: 'https://api.github.com/user',
                headers: {
                  'Authorization': 'token ' + data.token
                }
              })
                .done(function(userData) {
                  thisView.dbSet('auth-user', userData);
                  thisView.set('user', userData);
                  thisView.set('loggedIn', true);
                  thisView.set('authLoading', false);
                  thisView.githubAPI = new Github({
                    token: data.token,
                    auth: 'oauth'
                  });
                })
                .fail(function() {
                  thisView.authLogout();
                });
            }
            else {
              thisView.authLogout();
            }
          })
          .fail(function() {
            thisView.authLogout();
          });

        // Remove code
        this.urlSet(path.search(null));
      }
    },
    // Load user info from cache
    loadUser: function() {
      if (this.isLoggedIn()) {
        this.set('user', this.dbGet('auth-user'));
        this.set('loggedIn', true);
        this.githubAPI = new Github({
          token: this.dbGet('auth-token'),
          auth: 'oauth'
        });
      }
      else {
        this.authLogout();
        // Anonymous API
        this.githubAPI = new Github({
          token: this.dbGet('auth-token'),
          auth: 'oauth'
        });
      }
    },
    // Is logged in
    isLoggedIn: function() {
      return (this.dbGet('auth-token') && this.dbGet('auth-user'));
    },
    // Logout
    authLogout: function() {
      this.dbRemove('auth-token');
      this.dbRemove('auth-user');
      this.set('user', undefined);
      this.set('loggedIn', false);
      this.set('authLoading', false);
      this.githubAPI = undefined;
    },

    // Load initial data, from storage, or example
    initialLoad: function() {
      var storage = this.storageLoad();

      if (this.loadGist()) {
        // Nothing, gist will load async
      }
      else if (storage) {
        this.set('arrangementString', JSON.stringify(storage));
      }
      else {
        this.set('arrangementString', JSON.stringify(exampleItems));
      }
    },

    // CRUD operations for local storage
    storageSave: function() {
      var stored = this.dbGet('arrangements');
      stored = (_.isArray(stored)) ? stored : [];

      // Handle undo stack.  If undefined, then we have not
      // created one yet or the stack is empty.  If we are
      // down the stack, then we have to remove the rest
      // of it
      if (_.isUndefined(this.undoIndex) || this.undoIndex < 0) {
        this.undoIndex = stored.length - 1;
      }
      else if (this.undoIndex < stored.length - 1) {
        stored = _.first(stored, this.undoIndex + 1);
      }

      stored.push(this.get('arrangement'));
      this.undoIndex = stored.length - 1;
      this.dbSet('arrangements', stored);
    },
    storageLoad: function() {
      var stored = this.dbGet('arrangements');
      stored = (_.isArray(stored)) ? stored : [];
      this.undoIndex = stored.length - 1;
      return (stored.length === 0) ? undefined : stored[stored.length - 1];
    },
    storageReset: function() {
      this.undoIndex = undefined;
      this.dbSet('arrangements', []);
    },

    // Undo and redo
    undo: function() {
      var stored = this.dbGet('arrangements');
      stored = (_.isArray(stored)) ? stored : [];

      if (stored.length > 1) {
        this.undoIndex = this.undoIndex - 1;
        return stored[this.undoIndex];
      }

      return undefined;
    },

    // Process items into arrangement array.  Items should be just an array of
    // numbers or strings, while a arrangement should be an array of triplets
    // of [x, y, v] (x is column and )
    standardizeArrangement: function(items) {
      var arrange = [];
      var c = this.get('columns');
      var r = this.get('rows');

      if (_.isArray(items) && _.isArray(items[0]) && items[0].length === 3) {
        arrange = items;
      }
      else {
        _.each(items, function(i, ii) {
          arrange.push([(ii % c), parseInt((ii / c), 10), i]);
        });
      }

      return arrange;
    },

    // Process arrangement into cells array
    arrangementToCells: function(arrangement) {
      var c = this.get('columns');
      var r = this.get('rows');
      var l = c * r;
      var cells = new Array(l);

      _.each(arrangement, function(a, ai) {
        var place = ((a[1] * c) + a[0]);
        cells[place] = a[2];
      });

      return cells;
    },

    // Turns cells into arrangement
    cellsToArrangement: function(cells) {
      var c = this.get('columns');
      var r = this.get('rows');
      var arrange = [];

      _.each(cells, function(d, di) {
        if (!_.isUndefined(d)) {
          arrange.push([(di % c), parseInt((di / c), 10), d]);
        }
      });

      return arrange;
    },

    // Method to insert value where one exists
    insertItem: function(n, p) {
      var cells = _.clone(this.get('cellsArray'));
      var nextBlank, i;

      // Remove old value, as it could be replaced in the movement
      cells[p[0]] = undefined;

      // Find the next blank
      nextBlank = n[0];
      do {
        nextBlank = nextBlank + 1;
      } while (cells[nextBlank]);

      // Pull forward
      for (i = nextBlank; i > n[0]; i--) {
        cells[i] = cells[i - 1];
      }

      // Add new value
      cells[n[0]] = p[1];

      // Merge back in
      this.set('cellsArray', cells);
    },

    // Base DB operations
    dbSet: function(key, value) {
      db.setItem('aranger-' + key, JSON.stringify(value));
    },
    dbGet: function(key, value) {
      return JSON.parse(db.getItem('aranger-' + key));
    },
    dbRemove: function(key, value) {
      db.removeItem('aranger-' + key);
    },

    // URL operations
    urlGet: function() {
      return new URI(window.location.href);
    },
    urlSet: function(uri, trigger) {
      if (trigger === true) {
        window.history.pushState(undefined, undefined, uri.toString());
      }
      else {
        window.history.replaceState(undefined, undefined, uri.toString());
      }
    }
  });

  // Initialize view with data
  r = new View({
    data: {
      rows: rows,
      columns: columns,
      cells: cells,
      cellSize: cellSize
    }
  });

})();
