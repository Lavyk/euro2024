module.exports = function(app) {
    app.get('/intro', function(req, res) {
        res.render('intro');
    });
};
