var crypto = require('../conf/crypto')
module.exports.signinView = (req, res) => {
    var data = {}
    if (req.session.response) {
        data = req.session.response
        req.session.response = null
    }
    res.render('faculty/signin', { data: data, csrfToken: req.csrfToken() })
}
module.exports.isUser = (req, res) => {
    var find = {
        roll_no: parseInt(req.body.roll_no),
        password: req.body.password
    }
    var faculties = require('../model').faculties
    faculties.findOne(find, (err, result) => {
        if (!result) {
            req.session.response = {
                code: 1,
                message: 'Incorrect Username or Password'
            }
            res.redirect('/faculty')
            return
        }
        req.session.user = result
        req.session.role = 2
        res.redirect('/faculty/dashboard')
    })
}
module.exports.signupView = (req, res) => {
    var data = {}
    if (req.session.response) {
        data = req.session.response
        req.session.response = null
    }
    res.render('faculty/signup', { data: data, csrfToken: req.csrfToken() })
}
module.exports.sendOTP = (req, res) => {
    var find = { roll_no: parseInt(req.body.roll_no) }
    var faculties = require('../model').faculties
    faculties.findOne(find, (err, result) => {
        if (!result) {
            req.session.response = {
                code: 1,
                message: 'Incorrect Username.Please contact your admin.'
            }
            res.redirect('/faculty/signup')
            return
        }
        req.session.user_id = result.roll_no
        req.session.user_role = 1
        var min = 1000,
            max = 10000,
            otp = Math.floor(Math.random() * (max - min)) + min
        var to = result.email,
            subject = 'AssistsU-Chat --Password Reset',
            html = `One Time Password : ${otp}`
        var find = { user_id: result.roll_no, role: 1 },
            update = {
                $set: { otp: otp, created_at: new Date().toString() }
            }
        var users_otp = require('../model').users_otp
        users_otp.findOneAndUpdate(find, update, { upsert: true })
        sendmail(to, subject, html)
        var data = {
            code: 2,
            message: 'OTP sent to your registered mail ID'
        }
        res.render('faculty/verifyotp', { data: data, csrfToken: req.csrfToken() })
    })
}
module.exports.verifyOTP = (req, res) => {
    var find = {
        user_id: req.session.user_id,
        role: 1
    }
    var users_otp = require('../model').users_otp
    users_otp.findOne(find, (err, result) => {
        if (!result || req.body.otp != result.otp) {
            var data = {
                code: 1,
                message: 'Incorrect OTP'
            }
            res.render('faculty/verifyotp', { data: data, csrfToken: req.csrfToken() })
            return
        }
        res.render('faculty/changepassword', { data: {}, csrfToken: req.csrfToken() })
    })
}
module.exports.changePassword = (req, res) => {
    var find = { roll_no: req.session.user_id },
        update = { $set: { password: req.body.password } }
    var faculties = require('../model').faculties
    faculties.findOneAndUpdate(find, update)
    res.render('faculty/success', { csrfToken: req.csrfToken() })
    req.session.user_id = req.session.user_role = null
}
module.exports.dashboard = (req, res) => {
    var find = { roll_no: req.session.user.roll_no }
    var faculties = require('../model').faculties
    faculties.findOne(find, (err, result) => {
        var students = require('../model').students
        students.find({ faculty_id: req.session.user.roll_no }, { fields: { _id: 0, name: 1, roll_no: 1 } }).toArray((err, students) => {
            var data = {
                name: result.name,
                roll_no: result.roll_no,
                G: crypto.G,
                P: crypto.P,
                y: crypto.y,
                min: crypto.min,
                max: crypto.max,
                facultyID: result.roll_no,
                students: []
            }
            if (students) {
                data.students = students
            }
            res.render('faculty/dashboard', { data: data, csrfToken: req.csrfToken() })
        })
    })
}
module.exports.mykey = (req, res) => {
    var x = parseInt(req.body.x), b = crypto.b, P = crypto.P, key = crypto.compute(x, b, P).toString()
    var find = { roll_no: req.session.user.roll_no }, update = { $set: { key: key } }
    var faculties = require('../model').faculties
    faculties.findOneAndUpdate(find, update, { upsert: false }, (err, result) => { })
    req.session.user.key = key
    res.sendStatus(200)
    // console.log({ user: req.session.user, x: x, key: key })
}
module.exports.authorize = (req, res) => {
    var find = { roll_no: req.session.user.roll_no },
        update = {
            $set: { socketID: req.body.socketID, status: 1 }
        }
    var faculties = require('../model').faculties
    faculties.findOneAndUpdate(find, update, { upsert: false }, (err, result) => { })
    res.sendStatus(200)
}
module.exports.broadcastmessages = (req, res) => {
    var broadcastmessages = require('../model').broadcastmessages
    broadcastmessages.find({ to: req.session.user.roll_no }).toArray((err, _messages) => {
        var data = { messages: [] }, key = req.session.user.key
        if (_messages) _messages.forEach(message => {
            message.message = crypto.encrypt(message.message, key)
            data.messages.push(message)
        })
        res.send({ data: data })
    })
}
module.exports.broadcastmessage = (req, res) => {
    var newMessage = {
        name: req.session.user.name,
        from: req.session.user.roll_no,
        message: xss(crypto.decrypt(req.body.message, req.session.user.key)),
        time: new Date()
    }
    tMessage = Object.assign({}, newMessage)
    tMessage.message = crypto.encrypt(tMessage.message, req.session.user.key)
    res.send(tMessage)
    var broadcastmessages = require('../model').broadcastmessages
    broadcastmessages.insertOne(newMessage)
    var find = { status: 1, faculty_id: req.session.user.roll_no }
    var students = require('../model').students
    students.find(find).toArray((err, result) => {
        if (result) {
            result.forEach((student) => {
                tMessage = Object.assign({}, newMessage)
                tMessage.message = crypto.encrypt(tMessage.message, student.key)
                console.log(newMessage)
                console.log(tMessage)
                io.to(student.socketID).emit(`group-${req.session.user.roll_no}`, tMessage);
            })
        }
    })
}
module.exports.messages = (req, res) => {
    var find = { $or: [{ from: req.session.user.roll_no }, { to: req.session.user.roll_no }] }
    var messages = require('../model').messages
    messages.find(find).toArray((err, _messages) => {
        var data = { messages: [] }, key = req.session.user.key
        if (_messages) _messages.forEach(message => {
            message.message = crypto.encrypt(message.message, key)
            data.messages.push(message)
        })
        res.send({ data: data })
    })
}
module.exports.message = (req, res) => {
    var newMessage = {
        name: req.session.user.name,
        from: req.session.user.roll_no,
        to: parseInt(req.body.to),
        message: xss(crypto.decrypt(req.body.message, req.session.user.key)),
        time: new Date()
    }
    tMessage = Object.assign({}, newMessage)
    tMessage.message = crypto.encrypt(tMessage.message, req.session.user.key)
    res.send(tMessage)
    var messages = require('../model').messages
    messages.insertOne(newMessage)
    var find = { status: 1, roll_no: newMessage.to }
    var students = require('../model').students
    students.findOne(find, (err, result) => {
        if (result) {
            tMessage = Object.assign({}, newMessage)
            tMessage.message = crypto.encrypt(tMessage.message, result.key)
            io.to(result.socketID).emit(`${result.roll_no}`, tMessage)
        }
    })
}
module.exports.signout = (req, res) => {
    req.session.user = req.session.role = undefined
    res.redirect('/faculty')
}
io.on('connection', (socket) => {
    socket.on('disconnect', () => {
        var find = { socketID: socket.id },
            update = {
                $set: { status: 0, last_seen: new Date() },
                $unset: { socketID: 1 }
            }
        var faculties = require('../model').faculties
        faculties.findOneAndUpdate(find, update, { upsert: false }, (err, result) => { })
    })
})