var express = require('express');
var app = express();
var fs = require('fs'), parseString = require('xml2js').parseString;
var ejs = require('ejs');
var unzip = require('decompress');
app.set('view engine', 'ejs');

function Watcher(watchVar, ChangeTest, Callback) {
	this.watchVar = watchVar;
	this.ChangeTest = ChangeTest;
	this.Callback = Callback;

	this.GetValue = function() {
		return this.watchVar;
	}

	this.SetValue = function(val) {
		this.watchVar = val;
		console.log('Set value: ' + this.watchVar);
		if (this.ChangeTest(this.watchVar)) {
			console.log('Doing callback');
			this.Callback();
		}
	}
}

function getPriceFile() {
	var priceFile = fs.readFileSync('c:/btv/incoming/PriceFiles/price.xml', 'utf-8', function (err) {
		if (err) console.log(err);
	});
	parseString(priceFile, function(err, result) {
		if (err) { console.log(err); }
		//console.log(result);
		priceFile = result.specials;
	});
	console.log('Found items:');
	for (item in priceFile) {
		priceFile[item] = priceFile[item][0].trim();
		//console.log('|-' + item + ':' + priceFile[item]);
	}
	return priceFile;
}

function rmdirRecursively(path) {
	if (fs.existsSync(path)) {
		fs.readdirSync(path).forEach(function(file, index){
			var curPath = path + "/" + file;
	  if (fs.lstatSync(curPath).isDirectory()) { // recurse
	  	rmdirRecursively(curPath);
	  } else { // delete file
	  	fs.unlinkSync(curPath);
	  }
	});
		fs.rmdirSync(path);
	}
};

app.all('/incoming/Media/:path*', function (req, res, next) {
	switch (req.params[0].slice(req.params[0].lastIndexOf('.'))) {
		case '.zip':
		res.send('File request: /incoming/Media/' + req.params.path + req.params[0]);
		break;
		case '.html':
		console.log("Got HTML request: c:/Urchannel/incoming/Media/" + req.params.path + req.params[0]);
		console.log("Renaming index.html to ejs");
		fs.rename(req.params.path + req.params[0], req.params.path + req.params[0].replace(/\..{0,4}$/i, '.ejs'), function(err) {
			if (err) {
				if (err.code !== 'ENOENT') {
					throw err;
				}
			}
		});
		res.render('c:/urchannel/incoming/Media/'+ req.params.path + req.params[0].replace(/\..{0,4}$/i, '.ejs'), getPriceFile()); 
		break;
		default:
		var options = {
			root: 'c:/Urchannel/incoming/Media/',
			headers: {
				'x-timestamp': Date.now(),
				'x-sent': true
			}
		};
		res.sendFile(req.params.path + req.params[0], options, function (err) {
			if (err) {
				if (err.code !== 'ECONNABORTED') {
					next(err);
				}
			} else {
				console.log('Served file: ' + req.params.path + req.params[0]);
			}
		});
	}
});
app.get('/', function (req, res) {
	var showFileName;

	//console.log(priceFile);

	fs.readdir('C://urchannel//SignalFiles', function(err, files) {
		console.log('Files: ' + files);
		for (var x = 0; x < files.length; x++ ) {
			if (files[x].search(/_show\[r0c0\]/) >= 0) {
				showFileName = files[x].replace("_show\[r0c0\].sgf", ".show");
				console.log("Found signal file: " + files[x] + " - Renaming to " + showFileName);
				break;
			}
		}

		fs.readFile('C:/Urchannel/incoming/ShowFiles/' + showFileName, 'utf-8', function (err, data) {
			var showFile = JSON.parse(data);
			var regions = [];
			var htmlOut = '';
			//var completeRegions = new Watcher(0, function(val) {return val >= regions.length;}, function() {res.render('index', {htmlOut: htmlOut});});
			var itemCount = 0;
			for (region of showFile.Regions) {
				console.log('Region: ' + region.Name);
				for (playlist of region.Playlists) {
					console.log(playlist.Name);
					console.log('date string:'+playlist.StartTime.slice(6,-2));
					var today = new Date();
					var startDate = new Date(parseInt(playlist.StartTime.slice(6,-2)));
					var endDate = new Date(parseInt(playlist.EndTime.slice(6,-2)));
					console.log('startDate [' + startDate + ']\ntoday['+today+']\nendDate ['+endDate+']');
					if (today > startDate && today < endDate) {
/*						console.log('File name = ' + playlist.Items[0].Source);
console.log('mediaName = ' + playlist.Items[0].Name.replace(/[\&\s]/g,'').replace(/\..{0,4}$/i, ''));*/
regions.push({
	"x": (region.CanvasLeft / 1280) * 100,
	"y": (region.CanvasTop / 720) * 100,
	"w": (region.Width / 1280) * 100,
	"h": (region.Height /720) * 100,
	"name": region.Name,
	"mediaName": playlist.Name.replace(/[\&\s]/g,''),
	"mediaInfo": []
});
for (item of playlist.Items) {
							/*var itemType = item.AssetType;
							switch (itemType) {
								case 'Movie':
								itemType = 'video';
								break;
								case 'Zip':
								itemType = 'html';
								break;
								default:
								itemType = itemType.toLowerCase();
							}*/
							regions[regions.length-1].mediaInfo.push({ "source" : item.Source, "duration": item.DurationSeconds, "type" : item.AssetType.toLowerCase()});
						}
					}
				}
				itemCount++;
			}
			console.log('Found ' + itemCount + ' items to play');
			var completeRegions = new Watcher(0, function(val) {return val >= itemCount;}, function() {res.render('index', {htmlOut: htmlOut});});
			var renames = [];
			for (var x = 0; x < regions.length; x++) {
				console.log("region["+x+"]: " + regions[x].x + "," + regions[x].y + " - " + regions[x].w + "," + regions[x].h + " - name: " + regions[x].name + '| mediaName: ' + regions[x].mediaName + ' - mediaPath: ' + JSON.stringify(regions[x].mediaInfo, null, 3));
				var positioningStuff = 'position:absolute;top:' + regions[x].y + '%;left:' + regions[x].x+ '%;width:' + regions[x].w + '%;height:' + regions[x].h +'%;';
				/*var divStart*/ htmlOut = htmlOut + '<div id="'+regions[x].name+'" style="' +positioningStuff+'"></div>\n';
				htmlOut = htmlOut + '<div id="'+regions[x].name+'-playlist" style="display:none;">\n'
				for (var y = 0; y < regions[x].mediaInfo.length ; y++) {
					var jsonData = {"source": "/incoming" + regions[x].mediaInfo[y].source, "type" : regions[x].mediaInfo[y].type, "Duration" : regions[x].mediaInfo[y].duration};
					console.log('Configured new jsonData: ' + JSON.stringify(jsonData));
					if (regions[x].mediaInfo[y].type === 'zip') {
						jsonData.source = jsonData.source.replace(/\..{0,4}$/i,'');
						if (fs.existsSync('c:/Urchannel/incoming' + regions[x].mediaInfo[y].source.replace(/\..{0,4}$/i,''))) {
							console.log('Deleting current unzipped folder');
							rmdirRecursively('c:/Urchannel/incoming' + regions[x].mediaInfo[y].source.replace(/\..{0,4}$/i,''));
							console.log('Complete');
							unzip('c:/Urchannel/incoming' + regions[x].mediaInfo[y].source, 'c:/Urchannel/incoming/Media/', {
								map: file => {
									file.path = file.path.replace(/\.html$/i,'.ejs');
									return file;
								}
							}).then(res => {
								var indexPath = '';
								if (res.path) {
									indexPath = res.path;
								} else if (res[0]) {
									indexPath = res[0].path;
								}
							}).catch(err => {
								console.log('Error in unzip process: ' + err.stack);
							});
						}
					}
					/*switch (regions[x].mediaPath.slice(regions[x].mediaPath.lastIndexOf('.'))) {
						case '.zip':
						console.log('Zip stuff: ' + regions[x].mediaPath);
						if (fs.existsSync('c:/Urchannel/incoming' + regions[x].mediaPath.replace(/\..{0,4}$/i,''))) {
							console.log('Deleting current unzipped folder');
							rmdirRecursively('c:/Urchannel/incoming' + regions[x].mediaPath.replace(/\..{0,4}$/i,''));
							console.log('Complete');
						}
						//htmlOut = htmlOut + divStart + '<iframe scrolling="no" src="/incoming' + regions[x].mediaPath.replace(/\..{0,4}$/i, '') + '/index.html' +'" style="border:none;" width="100%" height="100%"></iframe></div>\n';
						htmlOut = htmlOut + '<li class>' + JSON.stringify(jsonData) + '</li>'
						unzip('c:/Urchannel/incoming' + regions[x].mediaPath, 'c:/Urchannel/incoming/Media/', {
							map: file => {
								file.path = file.path.replace(/\.html$/i,'.ejs');
								return file;
							}
						}).then(res => {
							var indexPath = '';
							if (res.path) {
								indexPath = res.path;
							} else if (res[0]) {
								indexPath = res[0].path;
							}
							completeRegions.SetValue(completeRegions.GetValue()+1);
							console.log('Added iframe for zip file: ' + indexPath.replace(/\/.*?$/i, '/') + 'index.html');
						}).catch(err => {
							console.log('Error in unzip process: ' + err.stack);
						});
						break;
						case '.html':
						htmlOut = htmlOut + divStart + '<iframe scrolling="no" src="/incoming' + regions[x].mediaPath +'" style="border:none;" width="100%" height="100%"></iframe></div>\n';
						completeRegions.SetValue(completeRegions.GetValue()+1);
						break;
						case '.png':
						htmlOut = htmlOut + '<img src="/incoming' + regions[x].mediaPath +'" style="' + positioningStuff + '"' +'></img>\n';
						completeRegions.SetValue(completeRegions.GetValue()+1);
						break;
						case '.mp4':
						htmlOut = htmlOut + '<video style="' + positioningStuff + '" autoplay loop><source src="/incoming' + regions[x].mediaPath +'" type="video/mp4"></video>\n';
						completeRegions.SetValue(completeRegions.GetValue()+1);
					}*/
					htmlOut = htmlOut + '<li class>' + JSON.stringify(jsonData) + '</li>\n';
				}
				htmlOut = htmlOut + '</div>\n';
				htmlOut = htmlOut + '<script>var ' + regions[x].name + ' = new RegionPlayer("' + regions[x].name + '");</script>\n';
				completeRegions.SetValue(completeRegions.GetValue()+1);
			}
/*			if (completeRegions == regions.length) {
				res.render('index', {htmlOut: htmlOut});
			} else {
				console.log('Reached render early.');
			}*/
		});
});

});
app.listen(3000, function () {
	console.log('Starting:  *:3000');
})
