
const express = require('express');
const path = require('path');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use("/images", express.static(path.join(__dirname, "images")));
// --------------------------------------------------
// HOME PAGE
// --------------------------------------------------

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --------------------------------------------------
// GET ROOMS
// GET /api/rooms
// GET /api/rooms?block=A&floor=1
// --------------------------------------------------

app.get('/api/rooms', (req, res) => {
    const { block, floor } = req.query;

    let sql = `
        SELECT
            r.room_id,
            r.room_number,
            r.block_name,
            r.floor_number,
            r.ac_type,
            r.capacity,
            r.occupied,
            (r.capacity - r.occupied) AS vacant_beds,
            CASE
                WHEN r.occupied >= r.capacity THEN 'Full'
                ELSE 'Available'
            END AS vacancy_status
        FROM rooms r
        WHERE 1 = 1
    `;

    const params = [];

    if (block !== undefined) {
        if (!['A', 'B', 'C'].includes(block)) {
            return res.status(400).json({
                message: 'Invalid block. Choose A, B or C.'
            });
        }

        sql += ' AND r.block_name = ?';
        params.push(block);
    }

    if (floor !== undefined) {
        const floorNumber = Number(floor);

        if (!Number.isInteger(floorNumber) || floorNumber < 1) {
            return res.status(400).json({
                message: 'Invalid floor number.'
            });
        }

        sql += ' AND r.floor_number = ?';
        params.push(floorNumber);
    }

    sql += ' ORDER BY r.floor_number, r.room_number';

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Get rooms error:', err);
            return res.status(500).json({
                message: 'Unable to load rooms.'
            });
        }

        res.json(results);
    });
});

// --------------------------------------------------
// GET ONE ROOM
// --------------------------------------------------

app.get('/api/rooms/:id', (req, res) => {
    db.query(
        `SELECT *,
                (capacity - occupied) AS vacant_beds
         FROM rooms
         WHERE room_id = ?`,
        [req.params.id],
        (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    message: 'Unable to retrieve room.'
                });
            }

            if (results.length === 0) {
                return res.status(404).json({
                    message: 'Room not found.'
                });
            }

            res.json(results[0]);
        }
    );
});

// --------------------------------------------------
// INSERT ROOM
// --------------------------------------------------

app.post('/api/rooms', (req, res) => {
    const {
        room_number,
        block_name,
        capacity,
        occupied = 0,
        floor_number,
        ac_type = 'Non-AC'
    } = req.body;

    const cap = Number(capacity);
    const occ = Number(occupied);
    const floor = Number(floor_number);

    if (
        !room_number?.trim() ||
        !['A', 'B', 'C'].includes(block_name) ||
        !Number.isInteger(cap) || cap < 1 ||
        !Number.isInteger(occ) || occ < 0 || occ > cap ||
        !Number.isInteger(floor) || floor < 1 ||
        !['AC', 'Non-AC'].includes(ac_type)
    ) {
        return res.status(400).json({
            message: 'Please enter valid room details.'
        });
    }

    db.query(
        `INSERT INTO rooms
         (room_number, block_name, capacity, occupied,
          floor_number, ac_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            room_number.trim(),
            block_name,
            cap,
            occ,
            floor,
            ac_type
        ],
        (err, result) => {
            if (err) {
                console.error(err);

                return res.status(400).json({
                    message: err.code === 'ER_DUP_ENTRY'
                        ? 'Room number already exists.'
                        : 'Unable to insert room.'
                });
            }

            res.status(201).json({
                message: 'Room inserted successfully.',
                room_id: result.insertId
            });
        }
    );
});

// --------------------------------------------------
// UPDATE ROOM
// --------------------------------------------------

app.put('/api/rooms/:id', (req, res) => {
    const {
        room_number,
        block_name,
        capacity,
        occupied,
        floor_number,
        ac_type
    } = req.body;

    const cap = Number(capacity);
    const occ = Number(occupied);
    const floor = Number(floor_number);

    if (
        !room_number?.trim() ||
        !['A', 'B', 'C'].includes(block_name) ||
        !Number.isInteger(cap) || cap < 1 ||
        !Number.isInteger(occ) || occ < 0 || occ > cap ||
        !Number.isInteger(floor) || floor < 1 ||
        !['AC', 'Non-AC'].includes(ac_type)
    ) {
        return res.status(400).json({
            message: 'Invalid room details.'
        });
    }

    db.query(
        `UPDATE rooms
         SET room_number = ?,
             block_name = ?,
             capacity = ?,
             occupied = ?,
             floor_number = ?,
             ac_type = ?
         WHERE room_id = ?`,
        [
            room_number.trim(),
            block_name,
            cap,
            occ,
            floor,
            ac_type,
            req.params.id
        ],
        (err, result) => {
            if (err) {
                console.error(err);

                return res.status(400).json({
                    message: err.code === 'ER_DUP_ENTRY'
                        ? 'Room number already exists.'
                        : 'Unable to update room.'
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    message: 'Room not found.'
                });
            }

            res.json({
                message: 'Room updated successfully.'
            });
        }
    );
});

// --------------------------------------------------
// DELETE ROOM
// A room with students cannot be deleted.
// --------------------------------------------------

app.delete('/api/rooms/:id', (req, res) => {
    db.query(
        'DELETE FROM rooms WHERE room_id = ? AND occupied = 0',
        [req.params.id],
        (err, result) => {
            if (err) {
                console.error(err);

                return res.status(400).json({
                    message: 'Room could not be deleted. Check its student records.'
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    message: 'Room not found or still occupied.'
                });
            }

            res.json({
                message: 'Room deleted successfully.'
            });
        }
    );
});

// --------------------------------------------------
// BOOK ROOM AND INSERT STUDENT
// POST /api/bookings
//
// Requires db.js to export a mysql2 connection pool.
// --------------------------------------------------

app.post('/api/bookings', (req, res) => {
    const {
        rollNo,
        name,
        phone,
        block,
        floor,
        room_id
    } = req.body;

    const roll = String(rollNo || '').trim();
    const studentName = String(name || '').trim();
    const studentPhone = String(phone || '').trim();
    const selectedBlock = String(block || '');
    const selectedFloor = Number(floor);
    const roomId = Number(room_id);

    if (
        !roll || roll.length > 30 ||
        !studentName || studentName.length > 100 ||
        !/^[0-9+\-\s]{10,15}$/.test(studentPhone) ||
        !['A', 'B', 'C'].includes(selectedBlock) ||
        !Number.isInteger(selectedFloor) || selectedFloor < 1 ||
        !Number.isInteger(roomId) || roomId < 1
    ) {
        return res.status(400).json({
            message: 'Please provide valid student and room details.'
        });
    }

    // Transactions prevent two simultaneous bookings from exceeding
    // the room's capacity. The rooms table must use InnoDB.
    db.getConnection((connectionError, connection) => {
        if (connectionError) {
            console.error(connectionError);

            return res.status(500).json({
                message: 'Unable to connect to the database.'
            });
        }

        connection.beginTransaction(transactionError => {
            if (transactionError) {
                connection.release();

                return res.status(500).json({
                    message: 'Unable to start booking transaction.'
                });
            }

            const rollback = (status, message) => {
                connection.rollback(() => {
                    connection.release();
                    res.status(status).json({ message });
                });
            };

            connection.query(
                `SELECT room_id, room_number, block_name,
                        floor_number, capacity, occupied
                 FROM rooms
                 WHERE room_id = ?
                 FOR UPDATE`,
                [roomId],
                (roomError, rooms) => {
                    if (roomError) {
                        console.error(roomError);

                        return rollback(
                            500,
                            'Unable to check room availability.'
                        );
                    }

                    if (rooms.length === 0) {
                        return rollback(404, 'Room not found.');
                    }

                    const room = rooms[0];

                    // Do not trust the room/block/floor supplied by the browser.
                    if (
                        room.block_name !== selectedBlock ||
                        Number(room.floor_number) !== selectedFloor
                    ) {
                        return rollback(
                            400,
                            'The selected room does not match the chosen block and floor.'
                        );
                    }

                    if (Number(room.occupied) >= Number(room.capacity)) {
                        return rollback(
                            409,
                            'This room is full. Please choose a vacant room.'
                        );
                    }

                    connection.query(
                        `INSERT INTO students
                         (roll_number, student_name, phone, room_id)
                         VALUES (?, ?, ?, ?)`,
                        [roll, studentName, studentPhone, roomId],
                        (studentError, result) => {
                            if (studentError) {
                                console.error(studentError);

                                if (studentError.code === 'ER_DUP_ENTRY') {
                                    return rollback(
                                        409,
                                        'This roll number is already registered.'
                                    );
                                }

                                if (studentError.code === 'ER_NO_REFERENCED_ROW_2') {
                                    return rollback(
                                        400,
                                        'The selected room does not exist.'
                                    );
                                }

                                return rollback(
                                    500,
                                    'Unable to register the student.'
                                );
                            }

                            connection.query(
                                `UPDATE rooms
                                 SET occupied = occupied + 1
                                 WHERE room_id = ?
                                   AND occupied < capacity`,
                                [roomId],
                                (updateError, updateResult) => {
                                    if (updateError) {
                                        console.error(updateError);

                                        return rollback(
                                            500,
                                            'Unable to update room occupancy.'
                                        );
                                    }

                                    if (updateResult.affectedRows !== 1) {
                                        return rollback(
                                            409,
                                            'The room is no longer available.'
                                        );
                                    }

                                    connection.commit(commitError => {
                                        if (commitError) {
                                            console.error(commitError);

                                            return connection.rollback(() => {
                                                connection.release();

                                                res.status(500).json({
                                                    message: 'Booking could not be saved.'
                                                });
                                            });
                                        }

                                        connection.release();

                                        res.status(201).json({
                                            message: 'Student registered and room booked successfully.',
                                            student_id: result.insertId,
                                            room_number: room.room_number,
                                            block: room.block_name,
                                            floor: room.floor_number
                                        });
                                    });
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

/* GET students by block */
app.get("/api/students", (req, res) => {
    const block = req.query.block;

    let sql = `
        SELECT
            s.student_id,
            s.roll_number,
            s.student_name,
            s.phone,
            s.room_id,
            r.block_name,
            r.floor_number,
            r.room_number,
            r.ac_type
        FROM students s
        JOIN rooms r ON s.room_id = r.room_id
    `;

    const params = [];

    if (block) {
        if (!["A", "B", "C"].includes(block)) {
            return res.status(400).json({
                error: "Invalid block. Select A, B, or C."
            });
        }

        sql += " WHERE r.block_name = ?";
        params.push(block);
    }

    sql += " ORDER BY r.floor_number, r.room_number, s.student_name";

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error("Error loading students:", err);
            return res.status(500).json({
                error: "Unable to load students from the database."
            });
        }

        res.json(results);
    });
});

/* UPDATE STUDENT */
app.put("/api/students/:id", (req, res) => {
    const studentId = Number(req.params.id);
    const {
        student_name,
        roll_number,
        phone,
        floor_number,
        room_id
    } = req.body;

    if (
        !Number.isInteger(studentId) ||
        studentId <= 0 ||
        !student_name?.trim() ||
        !roll_number?.trim() ||
        !phone?.trim() ||
        !Number.isInteger(Number(floor_number)) ||
        !Number.isInteger(Number(room_id))
    ) {
        return res.status(400).json({
            error: "Please provide valid student details, floor, and room."
        });
    }

    db.getConnection((connectionError, connection) => {
        if (connectionError) {
            console.error(connectionError);
            return res.status(500).json({
                error: "Database connection failed."
            });
        }

        connection.beginTransaction(err => {
            if (err) {
                connection.release();
                return res.status(500).json({
                    error: "Could not start the update."
                });
            }

            const rollback = (status, message) => {
                connection.rollback(() => {
                    connection.release();
                    res.status(status).json({ error: message });
                });
            };

            connection.query(
                `SELECT s.student_id, s.room_id, r.block_name
                 FROM students s
                 JOIN rooms r ON r.room_id = s.room_id
                 WHERE s.student_id = ?
                 FOR UPDATE`,
                [studentId],
                (err, studentRows) => {
                    if (err) {
                        return rollback(500, "Unable to find the student.");
                    }

                    if (!studentRows.length) {
                        return rollback(404, "Student not found.");
                    }

                    const oldRoomId = Number(studentRows[0].room_id);
                    const blockName = studentRows[0].block_name;
                    const newRoomId = Number(room_id);
                    const floor = Number(floor_number);

                    connection.query(
                        `SELECT room_id, room_number, block_name,
                                floor_number, capacity, occupied
                         FROM rooms
                         WHERE room_id = ?
                         FOR UPDATE`,
                        [newRoomId],
                        (err, roomRows) => {
                            if (err) {
                                return rollback(500, "Unable to check the room.");
                            }

                            if (!roomRows.length) {
                                return rollback(400, "Selected room does not exist.");
                            }

                            const room = roomRows[0];

                            // A student may move floors/rooms within the same block only.
                            if (
                                room.block_name !== blockName ||
                                Number(room.floor_number) !== floor
                            ) {
                                return rollback(
                                    400,
                                    "Select a room on the chosen floor in the student's existing block."
                                );
                            }

                            const updateStudent = () => {
                                connection.query(
                                    `UPDATE students
                                     SET student_name = ?,
                                         roll_number = ?,
                                         phone = ?,
                                         room_id = ?
                                     WHERE student_id = ?`,
                                    [
                                        student_name.trim(),
                                        roll_number.trim(),
                                        phone.trim(),
                                        newRoomId,
                                        studentId
                                    ],
                                    err => {
                                        if (err) {
                                            if (err.code === "ER_DUP_ENTRY") {
                                                return rollback(
                                                    409,
                                                    "That roll number is already assigned to another student."
                                                );
                                            }
                                            console.error(err);
                                            return rollback(500, "Unable to update student.");
                                        }

                                        connection.commit(err => {
                                            if (err) {
                                                return rollback(
                                                    500,
                                                    "Could not save the student update."
                                                );
                                            }

                                            connection.release();
                                            res.json({
                                                message: "Student updated successfully.",
                                                student_id: studentId
                                            });
                                        });
                                    }
                                );
                            };

                            // If the student stays in the same room, do not change occupancy.
                            if (oldRoomId === newRoomId) {
                                return updateStudent();
                            }

                            // Lock the old room too, then check available capacity.
                            connection.query(
                                `SELECT room_id, capacity, occupied
                                 FROM rooms
                                 WHERE room_id = ?
                                 FOR UPDATE`,
                                [oldRoomId],
                                (err, oldRoomRows) => {
                                    if (err || !oldRoomRows.length) {
                                        return rollback(500, "Unable to check the current room.");
                                    }

                                    const oldRoom = oldRoomRows[0];
                                    const capacity = Number(room.capacity);
                                    const occupied = Number(room.occupied);

                                    if (occupied >= capacity) {
                                        return rollback(400, "The selected room is full.");
                                    }

                                    connection.query(
                                        `UPDATE rooms
                                         SET occupied = GREATEST(occupied - 1, 0)
                                         WHERE room_id = ?`,
                                        [oldRoomId],
                                        err => {
                                            if (err) {
                                                return rollback(500, "Unable to update old room occupancy.");
                                            }

                                            connection.query(
                                                `UPDATE rooms
                                                 SET occupied = occupied + 1
                                                 WHERE room_id = ?`,
                                                [newRoomId],
                                                err => {
                                                    if (err) {
                                                        return rollback(500, "Unable to update new room occupancy.");
                                                    }

                                                    updateStudent();
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});


/* DELETE STUDENT */
app.delete("/api/students/:id", (req, res) => {
    const studentId = Number(req.params.id);

    if (!Number.isInteger(studentId) || studentId <= 0) {
        return res.status(400).json({
            error: "Invalid student ID."
        });
    }

    db.getConnection((connectionError, connection) => {
        if (connectionError) {
            console.error(connectionError);
            return res.status(500).json({
                error: "Database connection failed."
            });
        }

        connection.beginTransaction(err => {
            if (err) {
                connection.release();
                return res.status(500).json({
                    error: "Could not start the deletion."
                });
            }

            const rollback = (status, message) => {
                connection.rollback(() => {
                    connection.release();
                    res.status(status).json({ error: message });
                });
            };

            connection.query(
                `SELECT student_id, room_id
                 FROM students
                 WHERE student_id = ?
                 FOR UPDATE`,
                [studentId],
                (err, rows) => {
                    if (err) {
                        return rollback(500, "Unable to find the student.");
                    }

                    if (!rows.length) {
                        return rollback(404, "Student not found.");
                    }

                    const roomId = rows[0].room_id;

                    connection.query(
                        `DELETE FROM students WHERE student_id = ?`,
                        [studentId],
                        err => {
                            if (err) {
                                return rollback(500, "Unable to delete the student.");
                            }

                            connection.query(
                                `UPDATE rooms
                                 SET occupied = GREATEST(occupied - 1, 0)
                                 WHERE room_id = ?`,
                                [roomId],
                                err => {
                                    if (err) {
                                        return rollback(500, "Unable to update room occupancy.");
                                    }

                                    connection.commit(err => {
                                        if (err) {
                                            return rollback(500, "Could not save the deletion.");
                                        }

                                        connection.release();
                                        res.json({
                                            message: "Student deleted successfully."
                                        });
                                    });
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

app.listen(PORT, () => {
    console.log(
        `Hostel Management running at http://localhost:${PORT}`
    );
});
