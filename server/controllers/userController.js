import userModel from "../models/userModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import validator from "validator";
import Razorpay from "razorpay";
import transactionModel from "../models/transactionModel.js";
import crypto from "crypto";
import mongoose from "mongoose"; // Added missing mongoose import

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.json({ success: false, message: "Missing Details" });
    }

    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.json({
        success: false,
        message: "User with this email already exists",
      });
    }

    if (!validator.isEmail(email)) {
      return res.json({
        success: false,
        message: "Please enter a valid email",
      });
    }

    if (password.length < 8) {
      return res.json({
        success: false,
        message: "Password length should be atleast 8 characters!",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userData = {
      name,
      email,
      password: hashedPassword,
    };

    const newUser = new userModel(userData);
    const user = await newUser.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    res.json({ success: true, token, user: { name: user.name } });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userModel.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User does not exist" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      return res.json({
        success: true,
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
        },
      });
    } else {
      return res.json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const userCredits = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await userModel.findById(userId);
    res.json({
      success: true,
      credits: user.creditBalance,
      user: { name: user.name },
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const paymentRazorpay = async (req, res) => {
  try {
    const userId = req.userId;
    const { planId } = req.body;

    const userData = await userModel.findById(userId);

    if (!userData || !planId) {
      return res.json({ success: false, message: "Missing Details" });
    }

    let credits, plan, amount;

    switch (planId) {
      case "Basic":
        plan = "Basic";
        credits = 10;
        amount = 20;
        break;
      case "Advanced":
        plan = "Advanced";
        credits = 30;
        amount = 50;
        break;
      case "Premium":
        plan = "Premium";
        credits = 70;
        amount = 100;
        break;
      default:
        return res.json({ success: false, message: "Plan not found" });
    }

    const options = {
      amount: amount * 100,
      currency: process.env.CURRENCY || "INR",
      receipt: new mongoose.Types.ObjectId().toString(), // temporary ID
    };

    // 1. Create Razorpay Order first
    razorpayInstance.orders.create(options, async (error, order) => {
      if (error) {
        console.log("Razorpay Order Error:", error);
        return res.json({ success: false, message: error.message });
      }

      // 2. Now create transaction with razorpayOrderId
      const transactionData = {
        userId,
        plan,
        amount,
        credits,
        date: Date.now(),
        razorpayOrderId: order.id,
      };

      await transactionModel.create(transactionData);

      console.log("Razorpay Order:", order);

      return res.json({ success: true, order });
    });
  } catch (error) {
    console.log("Server Error:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to verify payment of razorpay - Corrected with signature verification
const verifyRazorpay = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    // A. Check for all required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.json({ success: false, message: "Missing payment details" });
    }

    // B. Recreate the signature string
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    // C. Verify the signature
    if (generatedSignature !== razorpay_signature) {
      console.log("Signature verification failed.");
      return res.json({
        success: false,
        message: "Payment verification failed",
      });
    }
    console.log("Signature verification successful.");

    // D. Find and update the transaction
    const transactionData = await transactionModel.findOne({
      razorpayOrderId: razorpay_order_id,
    });

    if (!transactionData) {
      console.log("Transaction not found for order ID:", razorpay_order_id);
      return res.json({ success: false, message: "Transaction not found" });
    }

    if (transactionData.payment) {
      console.log(
        "Payment already processed for transaction ID:",
        transactionData._id
      );
      return res.json({ success: false, message: "Payment already processed" });
    }

    // E. Update the user credits and transaction status
    const userData = await userModel.findById(transactionData.userId);

    if (!userData) {
      console.log("User not found for transaction ID:", transactionData._id);
      return res.json({ success: false, message: "User not found" });
    }

    const updatedCredits = userData.creditBalance + transactionData.credits;

    await userModel.findByIdAndUpdate(userData._id, {
      creditBalance: updatedCredits,
    });

    await transactionModel.findByIdAndUpdate(transactionData._id, {
      payment: true,
      razorpayPaymentId: razorpay_payment_id, // Store the payment ID for future reference
    });

    console.log("Credits added successfully for user:", userData._id);
    return res.json({ success: true, message: "Credits added successfully" });
  } catch (error) {
    console.error("Razorpay Verification Error:", error);
    return res.json({
      success: false,
      message: "An error occurred during verification",
    });
  }
};

export {
  registerUser,
  loginUser,
  userCredits,
  paymentRazorpay,
  verifyRazorpay,
};
